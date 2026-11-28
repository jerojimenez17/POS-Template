import axios from "axios";
import { UserRole } from "@prisma/client";
import { requireFeature, type AuthenticatedUserContext } from "@/lib/auth-gates";
import { db } from "@/lib/db";
import {
  getArcaCredentialsForBilling,
  getVoucherNumberForActor,
  type VoucherNumberResult,
} from "@/lib/server/arca-billing";
import BillState from "@/models/BillState";
import {
  formatAfipPointSaleErrorForUser,
  getAfipVoucherTypeCode,
  parseAfipPointSaleError,
  validatePointSaleRequest,
  type AfipPointSaleError,
  type AfipVoucherType,
} from "@/services/afip/point-sale-validation";
import {
  parseAfipVoucherResponse,
  type AfipResponseDiagnostic,
  type AfipVoucherSuccessData,
} from "@/services/afip/voucher-response";
import {
  mapOriginalBillTypeToCreditNoteAfipType,
  mapOriginalBillTypeToInvoiceAfipType,
  normalizeFiscalBreakdown,
  type FiscalBreakdownV1,
} from "@/services/afip/credit-note";
import {
  getEffectiveAfipInvoiceTotal,
  normalizeAfipInvoiceDTO,
  projectAfipInvoiceProduct,
  type AfipInvoiceDTO,
} from "@/utils/billing";
import { normalizeArcaIssuerCuit, type ArcaQrPayloadV1 } from "@/services/afip/qr-payload";
import { captureArcaCivilDate } from "@/services/afip/civil-date";
import { createAuthorizedArcaQrGrant, type AuthorizedArcaQrClaimsV1 } from "@/lib/server/authorized-arca-qr-grant";

export type AfipVoucherOperationResult =
  | { success: true; data: AfipVoucherSuccessData }
  | { error: string | AfipPointSaleError; diagnostic?: AfipResponseDiagnostic; issuanceNotStarted?: true };

interface PreparedVoucherPayload {
  billState: AfipInvoiceDTO;
  actor: AuthenticatedUserContext;
  businessId: string;
  cuit: string;
  cert: string;
  key: string;
  accessToken: string;
  internalKey: string;
  functionUrl: string;
  ptoVenta: number;
  tipoFactura: AfipVoucherType;
  isCreditNote: boolean;
  lastVoucherNumber: number;
  requestDate: string;
  createAuthorizedQrGrant: boolean;
}

interface PrepareAfipVoucherOptions {
  issuancePurpose?: "standard" | "payment-voucher";
}

export interface PreparedAfipVoucher {
  readonly [preparedVoucherBrand]: true;
}

const preparedVoucherBrand: unique symbol = Symbol("PreparedAfipVoucher");
const preparedPayloads = new WeakMap<PreparedAfipVoucher, PreparedVoucherPayload>();

export type PrepareAfipVoucherResult =
  | { success: true; prepared: PreparedAfipVoucher }
  | AfipVoucherOperationResult;

const getEffectiveUnitPrice = (product: { price: number; salePrice: number }): number => {
  if (product.salePrice > 0) return product.salePrice;
  if (product.price > 0) return product.price;
  return 0;
};

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isCreditNoteState(billState: BillState | Partial<AfipInvoiceDTO>): boolean {
  return (typeof billState.nroAsociado === "number" && billState.nroAsociado !== 0)
    || billState.ptoVentaAsociado !== undefined
    || billState.caeAsociado !== undefined
    || (Array.isArray(billState.CbtesAsoc) && billState.CbtesAsoc.length > 0);
}

function hasCreditNoteAssociationFields(billState: BillState | Partial<AfipInvoiceDTO>): boolean {
  return billState.nroAsociado !== undefined
    || billState.ptoVentaAsociado !== undefined
    || billState.caeAsociado !== undefined
    || billState.CbtesAsoc !== undefined;
}

function snapshotCreditNoteBillState(billState: BillState | AfipInvoiceDTO): AfipInvoiceDTO {
  const products = billState.products.map(projectAfipInvoiceProduct);
  const total = typeof billState.total === "number" && Number.isFinite(billState.total) ? billState.total : 0;
  const totalWithDiscount = typeof billState.totalWithDiscount === "number"
    && Number.isFinite(billState.totalWithDiscount) ? billState.totalWithDiscount : total;
  const billType = billState.billType === "Factura A" || billState.billType === "Factura C"
    ? billState.billType : "Factura B";
  const cbtesAsoc = billState.CbtesAsoc?.map((item) => {
    const projected: Record<string, unknown> = {};
    for (const field of ["Tipo", "PtoVta", "Nro"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(item, field);
      if (!descriptor) continue;
      if (!("value" in descriptor) || (typeof descriptor.value !== "number" && typeof descriptor.value !== "string")) {
        throw new Error("Los comprobantes asociados no son válidos");
      }
      projected[field] = descriptor.value;
    }
    return projected;
  });
  const date = billState.date instanceof Date
    ? billState.date.toISOString()
    : new Date(billState.date).toISOString();

  return {
    id: billState.id,
    seller: billState.seller,
    typeDocument: billState.typeDocument,
    IVACondition: billState.IVACondition,
    twoMethods: billState.twoMethods,
    ...(typeof billState.secondPaidMethod === "string" ? { secondPaidMethod: billState.secondPaidMethod } : {}),
    ...(billState.totalSecondMethod === null || typeof billState.totalSecondMethod === "number"
      ? { totalSecondMethod: billState.totalSecondMethod } : {}),
    ...(typeof billState.entrega === "number" ? { entrega: billState.entrega } : {}),
    ...(typeof billState.pago === "boolean" ? { pago: billState.pago } : {}),
    billType,
    ...(typeof billState.paidMethod === "string" ? { paidMethod: billState.paidMethod } : {}),
    ...(typeof billState.clientId === "string" ? { clientId: billState.clientId } : {}),
    ...(typeof billState.client === "string" ? { client: billState.client } : {}),
    ...(typeof billState.clientIvaCondition === "string" ? { clientIvaCondition: billState.clientIvaCondition } : {}),
    ...(billState.clientDocumentType === "CUIT" || billState.clientDocumentType === "DNI"
      ? { clientDocumentType: billState.clientDocumentType } : {}),
    ...(typeof billState.clientDocumentNumber === "string" ? { clientDocumentNumber: billState.clientDocumentNumber } : {}),
    discount: typeof billState.discount === "number" && Number.isFinite(billState.discount) ? billState.discount : 0,
    documentNumber: Number.isSafeInteger(billState.documentNumber) && billState.documentNumber >= 0
      ? billState.documentNumber : 0,
    total,
    totalWithDiscount,
    date,
    ...(typeof billState.ptoVenta === "number" ? { ptoVenta: billState.ptoVenta } : {}),
    products,
    ...(typeof billState.nroAsociado === "number" ? { nroAsociado: billState.nroAsociado } : {}),
    ...(typeof billState.ptoVentaAsociado === "number" ? { ptoVentaAsociado: billState.ptoVentaAsociado } : {}),
    ...(typeof billState.caeAsociado === "string" ? { caeAsociado: billState.caeAsociado } : {}),
    ...(cbtesAsoc ? { CbtesAsoc: cbtesAsoc } : {}),
    ...(billState.fiscalBreakdown ? { fiscalBreakdown: billState.fiscalBreakdown } : {}),
  };
}

function isSelectedCreditNotePointOfSale(pointOfSale: unknown, configuredPoints: unknown): pointOfSale is number {
  if (!Array.isArray(configuredPoints) || configuredPoints.length === 0) return false;
  const configuredFirst: unknown = configuredPoints[0];
  return isPositiveSafeInteger(configuredFirst)
    && pointOfSale === configuredFirst
    && configuredPoints.includes(pointOfSale);
}

function preflightError(result: VoucherNumberResult, ptoVenta: number, tipoFactura: AfipVoucherType): AfipVoucherOperationResult | undefined {
  const failed = ("error" in result && Boolean(result.error)) || Boolean(result.errorDetails);
  const validNumber = typeof result.success === "number"
    && Number.isSafeInteger(result.success)
    && result.success >= 0;
  if (!failed && validNumber) return undefined;

  const pointError = result.errorDetails ?? parseAfipPointSaleError(result.error ?? "No se obtuvo numeración", {
    operation: "getLastVoucher",
    ptoVenta,
    tipoFactura,
    environment: process.env.AFIP_ENVIRONMENT === "produccion"
      ? "produccion"
      : process.env.AFIP_ENVIRONMENT === "homologacion" ? "homologacion" : "desconocido",
  });
  return {
    error: pointError.code === "11002" ? pointError : formatAfipPointSaleErrorForUser(pointError),
    issuanceNotStarted: true,
  };
}

function resolveRecipientIvaCondition(billState: Pick<AfipInvoiceDTO, "clientIvaCondition" | "IVACondition">): string {
  return billState.clientIvaCondition?.trim() || billState.IVACondition?.trim() || "";
}

function buildAuthorizedInvoiceQrPayload(
  requestDate: string,
  cuit: string,
  billState: AfipInvoiceDTO,
  data: AfipVoucherSuccessData,
): ArcaQrPayloadV1 | null {
  const normalizedCuit = normalizeArcaIssuerCuit(cuit);
  if (!normalizedCuit) return null;
  const recipientType = billState.clientDocumentType;
  const hasNoDocument = recipientType === undefined
    && (billState.clientDocumentNumber === undefined || billState.clientDocumentNumber.trim() === "");
  const isConsumerFinal = resolveRecipientIvaCondition(billState).toLocaleLowerCase().replace(/_/g, " ") === "consumidor final";
  const tipoDocRec = recipientType === "CUIT" ? 80 : recipientType === "DNI" ? 96 : hasNoDocument && isConsumerFinal ? 99 : null;
  const nroDocRec = tipoDocRec === 99
    ? 0
    : tipoDocRec !== null && billState.clientDocumentNumber && /^\d+$/.test(billState.clientDocumentNumber)
      ? Number(billState.clientDocumentNumber)
      : null;
  const cae = Number(data.cae);
  const nroCmp = typeof data.nroComprobante === "number" ? data.nroComprobante : Number(data.nroComprobante);
  const ptoVta = typeof data.ptoVenta === "number" ? data.ptoVenta : Number(data.ptoVenta);
  const amount = data.fiscalSnapshot?.total ?? getEffectiveAfipInvoiceTotal(billState);
  if (tipoDocRec === null || nroDocRec === null) return null;

  const payload: ArcaQrPayloadV1 = {
    ver: 1,
    fecha: requestDate,
    cuit: Number(normalizedCuit),
    ptoVta,
    tipoCmp: getAfipVoucherTypeCode(billState.billType),
    nroCmp,
    importe: amount,
    moneda: "PES",
    ctz: 1,
    tipoDocRec,
    nroDocRec,
    tipoCodAut: "E",
    codAut: cae,
  };
  return Number.isSafeInteger(payload.cuit)
    && Number.isSafeInteger(payload.nroDocRec)
    ? payload
    : null;
}

/**
 * Performs all local billing validation and the read-only ARCA sequence lookup.
 * The returned handle is opaque and is only consumable by issuePreparedAfipVoucher.
 */
export async function prepareAfipVoucherForActor(
  billState: BillState | Partial<AfipInvoiceDTO>,
  sessionActor: AuthenticatedUserContext,
  requestDate?: string,
  options: PrepareAfipVoucherOptions = {},
): Promise<PrepareAfipVoucherResult> {
  const preparedRequestDate = requestDate && /^\d{4}-\d{2}-\d{2}$/.test(requestDate)
    ? requestDate
    : "requestDate" in billState
      && typeof billState.requestDate === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(billState.requestDate)
      ? billState.requestDate
      : captureArcaCivilDate();

  if (!sessionActor.id
    || (sessionActor.role !== UserRole.USER
      && sessionActor.role !== UserRole.ADMIN
      && sessionActor.role !== UserRole.SUPER_ADMIN)
    || !sessionActor.businessId) {
    return { error: "No autorizado", issuanceNotStarted: true };
  }

  if (sessionActor.role === UserRole.USER
    && (hasCreditNoteAssociationFields(billState)
      || ("fiscalSnapshot" in billState && billState.fiscalSnapshot !== undefined)
      || billState.fiscalBreakdown !== undefined
      || ("creditNote" in billState && billState.creditNote !== undefined)
      || ("originalVoucher" in billState && billState.originalVoucher !== undefined)
      || (billState.billType !== "Factura A"
        && billState.billType !== "Factura B"
        && billState.billType !== "Factura C"))) {
    return { error: "No autorizado", issuanceNotStarted: true };
  }

  const featureResult = await requireFeature("hasAfipBilling", sessionActor);
  if (!featureResult.success) {
    return { error: featureResult.error, issuanceNotStarted: true };
  }
  const actor = featureResult.data;
  const businessId = actor.businessId;
  if (!businessId || businessId !== sessionActor.businessId
    || actor.id !== sessionActor.id || actor.role !== sessionActor.role) {
    return { error: "No autorizado", issuanceNotStarted: true };
  }

  const credentials = await getArcaCredentialsForBilling(businessId);
  if (credentials.error || !credentials.success) {
    return {
      error: credentials.error || "No se pudieron obtener las credenciales de ARCA",
      issuanceNotStarted: true,
    };
  }

  const isCreditNote = isCreditNoteState(billState);
  let validatedBillState: BillState | AfipInvoiceDTO;
  try {
    validatedBillState = isCreditNote
      ? billState as BillState
      : normalizeAfipInvoiceDTO(billState);
  } catch {
    return { error: "Los datos de la factura no son válidos", issuanceNotStarted: true };
  }
  const ptoVenta: unknown = validatedBillState.ptoVenta;
  let validatedFiscalBreakdown: FiscalBreakdownV1 | undefined;
  let tipoFactura: AfipVoucherType;
  try {
    if (!isPositiveSafeInteger(ptoVenta)) {
      throw new Error("El punto de venta de emisión debe ser un entero positivo válido");
    }
    if (isCreditNote && (!isPositiveSafeInteger(validatedBillState.nroAsociado)
      || !isPositiveSafeInteger(validatedBillState.ptoVentaAsociado))) {
      throw new Error("Los datos del comprobante original de la Nota de Crédito no son válidos");
    }
    const invoiceBillType = validatedBillState.billType ?? "Factura B";
    tipoFactura = isCreditNote
      ? mapOriginalBillTypeToCreditNoteAfipType(invoiceBillType)
      : getAfipVoucherTypeCode(invoiceBillType);
    validatePointSaleRequest(
      { ptoVenta, tipoFactura },
      credentials.success.ptoVentas ?? (isCreditNote ? [] : [ptoVenta]),
      isCreditNote ? "credit-note" : "invoice",
    );
    if (isCreditNote && !isSelectedCreditNotePointOfSale(ptoVenta, credentials.success.ptoVentas)) {
      throw new Error("La Nota de Crédito debe emitirse desde el primer punto de venta configurado");
    }
    if (isCreditNote) {
      const expectedOriginalType = mapOriginalBillTypeToInvoiceAfipType(invoiceBillType);
      const breakdown = normalizeFiscalBreakdown(validatedBillState.fiscalBreakdown, {
        originalAfipVoucherType: expectedOriginalType,
        total: Number(validatedBillState.totalWithDiscount ?? validatedBillState.total),
      });
      if (!breakdown) throw new Error("No está disponible un desglose fiscal autorizado válido para la Nota de Crédito");
      validatedFiscalBreakdown = breakdown;
    }
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : "Punto de venta inválido",
      issuanceNotStarted: true,
    };
  }

  const requestedTotal = getEffectiveAfipInvoiceTotal(validatedBillState);
  if (requestedTotal <= 0) {
    return {
      error: "No se puede generar la factura: el monto total debe ser mayor a 0",
      issuanceNotStarted: true,
    };
  }

  const numberResult: VoucherNumberResult = await getVoucherNumberForActor(
    ptoVenta,
    tipoFactura,
    isCreditNote ? "credit-note" : "invoice",
    { businessId, role: actor.role },
  );
  const error = preflightError(numberResult, ptoVenta, tipoFactura);
  if (error) return error;

  const accessToken = process.env.AFIP_SDK_ACCESS_TOKEN;
  const internalKey = process.env.INTERNAL_AFIP_API_KEY;
  if (!accessToken) {
    console.error("AFIP_SDK_ACCESS_TOKEN no configurado");
    return { error: "Error de configuración de acceso", issuanceNotStarted: true };
  }
  if (!internalKey) {
    console.error("Missing INTERNAL_AFIP_API_KEY in environment variables");
    return { error: "Error de configuración de seguridad interna", issuanceNotStarted: true };
  }

  let preparedBillState: AfipInvoiceDTO;
  try {
    preparedBillState = isCreditNote
      ? snapshotCreditNoteBillState(validatedBillState)
      : normalizeAfipInvoiceDTO(validatedBillState);
    if (validatedFiscalBreakdown) preparedBillState.fiscalBreakdown = validatedFiscalBreakdown;
  } catch (error: unknown) {
    console.error("[createVoucher] invalid bill snapshot", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { error: "Los datos de la factura no son válidos para preparar la emisión", issuanceNotStarted: true };
  }

  const prepared = Object.freeze({ [preparedVoucherBrand]: true as const });
  preparedPayloads.set(prepared, {
    billState: preparedBillState,
    actor,
    businessId,
    cuit: credentials.success.cuit,
    cert: credentials.success.cert,
    key: credentials.success.key,
    accessToken,
    internalKey,
    functionUrl: process.env.NEXT_PUBLIC_AFIP_FUNCTION_URL
      || "http://127.0.0.1:5001/stockia-e90c6/us-central1/createAFIPVoucher",
    ptoVenta,
    tipoFactura,
    isCreditNote,
    lastVoucherNumber: numberResult.success as number,
    requestDate: preparedRequestDate,
    createAuthorizedQrGrant: options.issuancePurpose !== "payment-voucher",
  });
  return { success: true, prepared };
}

/** Issues only a voucher that was prepared in this server process. */
export async function issuePreparedAfipVoucher(
  prepared: PreparedAfipVoucher,
  onDispatch?: () => Promise<void>,
): Promise<AfipVoucherOperationResult> {
  const payload = preparedPayloads.get(prepared);
  if (!payload) return { error: "La prevalidación de ARCA ya no está disponible", issuanceNotStarted: true };
  const requestDate = payload.requestDate;
  // A prepared preflight is single-use: it cannot be replayed to create duplicate vouchers.
  preparedPayloads.delete(prepared);

  const {
    billState,
    actor,
    businessId,
    ptoVenta,
    tipoFactura,
    lastVoucherNumber,
  } = payload;
  if (actor.role === UserRole.USER && payload.isCreditNote) {
    return { error: "No autorizado", issuanceNotStarted: true };
  }
  if (actor.businessId !== businessId || !Number.isSafeInteger(lastVoucherNumber) || lastVoucherNumber < 0) {
    return { error: "La prevalidación de ARCA no es válida", issuanceNotStarted: true };
  }

  if (payload.isCreditNote) {
    let configuredPoints: number[] | undefined;
    try {
      const credentials = await getArcaCredentialsForBilling(businessId);
      if (credentials.success) configuredPoints = credentials.success.ptoVentas;
    } catch {
      return { error: "No se pudo validar la configuración del punto de venta de la Nota de Crédito", issuanceNotStarted: true };
    }
    if (!isSelectedCreditNotePointOfSale(ptoVenta, configuredPoints)) {
      return { error: "La configuración del punto de venta de la Nota de Crédito cambió; vuelva a validar la operación", issuanceNotStarted: true };
    }
  }

  const functionUrl = payload.functionUrl;
  const billStateWithoutPtoVenta = billState;

  const discount = Number(billStateWithoutPtoVenta.discount) || 0;
  const effectiveTotalWithDiscount = getEffectiveAfipInvoiceTotal(billStateWithoutPtoVenta);

  const minimalBillState = {
    id: billStateWithoutPtoVenta.id,
    seller: billStateWithoutPtoVenta.seller,
    typeDocument: billStateWithoutPtoVenta.typeDocument,
    IVACondition: billStateWithoutPtoVenta.IVACondition,
    twoMethods: billStateWithoutPtoVenta.twoMethods,
    secondPaidMethod: billStateWithoutPtoVenta.secondPaidMethod,
    totalSecondMethod: billStateWithoutPtoVenta.totalSecondMethod,
    entrega: billStateWithoutPtoVenta.entrega,
    pago: billStateWithoutPtoVenta.pago,
    billType: billStateWithoutPtoVenta.billType,
    nroAsociado: billStateWithoutPtoVenta.nroAsociado,
    ptoVentaAsociado: billStateWithoutPtoVenta.ptoVentaAsociado,
    caeAsociado: billStateWithoutPtoVenta.caeAsociado,
    CbtesAsoc: billStateWithoutPtoVenta.CbtesAsoc,
    ...(payload.isCreditNote ? {
      fiscalBreakdown: normalizeFiscalBreakdown(billStateWithoutPtoVenta.fiscalBreakdown, {
        originalAfipVoucherType: mapOriginalBillTypeToInvoiceAfipType(billStateWithoutPtoVenta.billType ?? ""),
        total: Number(billStateWithoutPtoVenta.totalWithDiscount ?? billStateWithoutPtoVenta.total),
      }),
    } : {}),
    paidMethod: billStateWithoutPtoVenta.paidMethod,
    clientId: billStateWithoutPtoVenta.clientId,
    client: billStateWithoutPtoVenta.client,
    clientIvaCondition: billStateWithoutPtoVenta.clientIvaCondition,
    clientDocumentType: billStateWithoutPtoVenta.clientDocumentType,
    clientDocumentNumber: billStateWithoutPtoVenta.clientDocumentNumber,
    products: billStateWithoutPtoVenta.products.map((product) => ({
      id: product.id,
      code: product.code,
      description: product.description,
      price: getEffectiveUnitPrice(product),
      salePrice: product.salePrice ?? 0,
      amount: product.amount,
    })),
    discount,
    documentNumber: Number(billStateWithoutPtoVenta.documentNumber) || 0,
    total: effectiveTotalWithDiscount,
    totalWithDiscount: effectiveTotalWithDiscount,
    // Keep createVoucher's established bill date wire format. requestDate is
    // the separately captured ARCA civil date used for the CAE/QR record.
    date: billStateWithoutPtoVenta.date,
  };

  if (effectiveTotalWithDiscount <= 0) {
    return {
      error: "No se puede generar la factura: el monto total debe ser mayor a 0",
      issuanceNotStarted: true,
    };
  }

  // Recheck authorization and persisted eligibility at the irreversible boundary.
  const featureResult = await requireFeature("hasAfipBilling", actor);
  if (!featureResult.success) {
    return { error: featureResult.error, issuanceNotStarted: true };
  }
  if (featureResult.data.id !== actor.id
    || featureResult.data.role !== actor.role
    || featureResult.data.businessId !== businessId) {
    return { error: "No autorizado", issuanceNotStarted: true };
  }

  let isPersistedBusinessEligible = false;
  try {
    const persistedBusiness = await db.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        features: { select: { hasAfipBilling: true } },
      },
    });
    isPersistedBusinessEligible = persistedBusiness?.id === businessId
      && persistedBusiness.features?.hasAfipBilling === true;
  } catch {
    console.error("Failed to verify persisted AFIP billing eligibility before voucher issuance");
    return { error: "No se pudo validar la habilitación de AFIP/ARCA", issuanceNotStarted: true };
  }
  if (!isPersistedBusinessEligible) {
    return { error: "La facturación AFIP/ARCA no está habilitada para este negocio", issuanceNotStarted: true };
  }

  const requestBody = {
    action: "createVoucher",
    encryptedCert: payload.cert,
    encryptedKey: payload.key,
    arca: {
      accessToken: payload.accessToken,
      cuit: payload.cuit,
      puntoVenta: ptoVenta,
      tipoFactura,
    },
    billState: minimalBillState,
  };
  const requestConfig = {
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": payload.internalKey,
    },
  };

  // This is the last deterministic transition before the irreversible POST.
  // If durable dispatch marking fails, do not contact the remote gateway.
  try {
    await onDispatch?.();
  } catch {
    return { error: "No se pudo confirmar la preparación de la factura", issuanceNotStarted: true };
  }

  try {
    const response = await axios.post(functionUrl, requestBody, requestConfig);

    const parsed = parseAfipVoucherResponse(response.data, {
      status: response.status,
      ptoVenta,
      tipoFactura,
      environment: process.env.AFIP_ENVIRONMENT === "produccion"
        ? "produccion"
        : process.env.AFIP_ENVIRONMENT === "homologacion" ? "homologacion" : "desconocido",
    });
    if (parsed.kind === "success") {
      let qrAttestationToken: string | undefined;
      if (!payload.isCreditNote && payload.createAuthorizedQrGrant) {
        const billType = payload.billState.billType;
        const rawQrData = typeof parsed.data.qrData === "string" && parsed.data.qrData.trim().length > 0
          ? parsed.data.qrData
          : null;
        const qrPayload = buildAuthorizedInvoiceQrPayload(requestDate, payload.cuit, payload.billState, parsed.data);
        const amount = parsed.data.fiscalSnapshot?.total ?? effectiveTotalWithDiscount;
        const invoiceNumber = Number(parsed.data.nroComprobante);
        const pointOfSale = Number(parsed.data.ptoVenta);
        const documentType = payload.billState.clientDocumentType ?? null;
        const recipientDocumentNumber = payload.billState.clientDocumentNumber?.trim()
          ? payload.billState.clientDocumentNumber ?? null
          : null;
        if ((billType === "Factura A" || billType === "Factura B" || billType === "Factura C")
          && Number.isSafeInteger(invoiceNumber) && invoiceNumber > 0
          && Number.isSafeInteger(pointOfSale) && pointOfSale > 0
          && Number.isFinite(amount) && amount > 0) {
          const claims: AuthorizedArcaQrClaimsV1 = {
            businessId,
            cae: parsed.data.cae,
            billType,
            afipVoucherType: billType === "Factura A" ? 1 : billType === "Factura B" ? 6 : 11,
            invoiceNumber,
            pointOfSale,
            fiscalAmount: amount.toFixed(2),
            issuerCuit: payload.cuit,
            requestDate,
            recipientIvaCondition: resolveRecipientIvaCondition(payload.billState),
            recipientDocumentType: documentType === "CUIT" || documentType === "DNI" ? documentType : null,
            recipientDocumentNumber,
            payload: qrPayload,
            rawQrData,
          };
          try {
            const grant = await createAuthorizedArcaQrGrant(claims);
            qrAttestationToken = grant?.token;
          } catch {
            // Attestation persistence is deliberately non-fatal after CAE authorization.
            qrAttestationToken = undefined;
          }
        }
      }
      return {
        success: true,
        data: {
          ...parsed.data,
          requestDate,
          ...(qrAttestationToken ? { qrAttestationToken } : {}),
        },
      };
    }
    console.warn("[createVoucher] AFIP response shape", parsed.responseShape);
    if (parsed.kind === "afip-error") {
      return {
        error: parsed.error,
        diagnostic: { ...parsed.responseShape, reason: "afip-error", authoritativeRejection: parsed.authoritativeRejection },
      };
    }
    return { error: parsed.message, diagnostic: { ...parsed.responseShape, reason: "missing-cae" } };
  } catch (error: unknown) {
    let errorMsg: string | AfipPointSaleError = "Error al comunicarse con el servicio de AFIP";
    if (axios.isAxiosError(error)) {
      const parsedResponse = parseAfipVoucherResponse(error.response?.data ?? error.message, {
        status: error.response?.status,
        ptoVenta,
        tipoFactura,
        environment: "desconocido",
      });
      if (parsedResponse.kind === "afip-error") {
        console.warn("[createVoucher] AFIP error shape", parsedResponse.responseShape);
        return {
          error: parsedResponse.error,
          diagnostic: { ...parsedResponse.responseShape, reason: "afip-error", authoritativeRejection: parsedResponse.authoritativeRejection },
        };
      }
      const parsed = parseAfipPointSaleError(error.response?.data ?? error.message, {
        operation: "createVoucher",
        ptoVenta,
        tipoFactura,
        environment: "desconocido",
      });
      errorMsg = parsed.code === "11002" ? parsed : parsed.message;
    } else if (error instanceof Error) {
      const parsed = parseAfipPointSaleError(error, {
        operation: "createVoucher",
        ptoVenta,
        tipoFactura,
        environment: "desconocido",
      });
      console.error("[createVoucher] AFIP client failure", {
        code: parsed.code,
        operation: parsed.operation,
        ptoVenta: parsed.ptoVenta,
        tipoFactura: parsed.tipoFactura,
      });
      errorMsg = parsed.code === "11002" ? parsed : parsed.message;
    }
    return { error: errorMsg };
  }
}
