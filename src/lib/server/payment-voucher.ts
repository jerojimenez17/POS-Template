import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, type PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { AuthenticatedUserContext } from "@/lib/auth-gates";
import {
  issuePreparedAfipVoucher,
  prepareAfipVoucherForActor,
  type PreparedAfipVoucher,
} from "@/lib/server/afip-voucher";
import { MAX_WHOLE_PESO_AMOUNT, toPositiveWholePesos } from "@/lib/money";
import { PaymentVoucherIssueError, paymentVoucherIssueFailureOutcome } from "@/lib/server/payment-voucher-outcome";

export { PaymentVoucherIssueError, paymentVoucherIssueFailureOutcome } from "@/lib/server/payment-voucher-outcome";
export type { PaymentVoucherIssueFailureOutcome } from "@/lib/server/payment-voucher-outcome";

export interface PaymentVoucherPayment {
  id: string;
  businessId: string;
  total: number;
  paidMethod?: string | null;
  order: {
    id: string;
    businessId: string;
    total: number;
    seller?: string | null;
    clientIvaCondition?: string | null;
    clientDocumentType?: string | null;
    clientDocumentNumber?: string | null;
    date?: Date;
      client: {
        id: string;
        name?: string | null;
        documentNumber?: string | null;
        cuit?: string | null;
        ivaCondition?: string | null;
        fiscalDocumentType?: "CUIT" | "DNI" | null;
        fiscalDocumentNumber?: string | null;
      } | null;
    products?: Array<{ description: string; amount: number; salePrice: number }>;
    invoice?: {
      cae: string | null;
      billType: string | null;
      invoiceNumber: number | null;
    };
  };
  business?: {
    name?: string;
    ptoVenta?: number[];
    condicionIva?: string;
  };
}

interface RecipientSnapshot {
  name: string;
  ivaCondition: string;
  documentType: "CUIT" | "DNI" | null;
  documentNumber: string | null;
}

export interface PaymentVoucherDependencies {
  auth: () => Promise<{ user: { id: string; businessId?: string; role?: string; business?: unknown } } | null>;
  repository: {
    findPayment: (id: string, businessId: string) => Promise<PaymentVoucherPayment | null>;
    isAfipEligible: (businessId: string) => Promise<boolean>;
    claim: (input: {
      paymentId: string;
      businessId: string;
      billType: string;
      amount: number;
      ptoVenta: number;
      recipientSnapshot: RecipientSnapshot;
    }) => Promise<{ status: string; attempt: number; acquired: boolean }>;
    markDispatched?: (input: { paymentId: string; businessId: string; attempt: number }) => Promise<void>;
    failPreparing?: (input: { paymentId: string; businessId: string; attempt: number }) => Promise<void>;
    persistAuthorized: (input: Record<string, unknown>) => Promise<void>;
    persistFailure: (input: Record<string, unknown>) => Promise<void>;
    getVoucher: (paymentId: string, businessId: string) => Promise<Record<string, unknown> | null>;
    transaction: <T>(callback: () => Promise<T>) => Promise<T>;
  };
  afip: {
    prepare: (invoice: Record<string, unknown>) => Promise<{ ok: true; capability: unknown } | { ok: false; definite: true }>;
    issue: (capability: unknown, onDispatch?: () => Promise<void>) => Promise<
      | { kind: "authorized"; total: number | string; cae: string; invoiceNumber: number; pointOfSale: number; issuedAt: Date; caeVencimiento?: string; qrData?: string }
      | { kind: "rejected" }
      | {
           kind: "unknown";
           total?: number | string;
          cae?: string;
          invoiceNumber?: number;
          pointOfSale?: number;
          issuedAt?: Date;
          caeVencimiento?: string;
          qrData?: string;
        }
    >;
    reconcile: (paymentId: string, attemptNumber: number) => Promise<
      | {
          kind: "authorized";
          correlation: { cashMovementId: string; attemptNumber: number };
          voucher: Record<string, unknown>;
        }
      | { kind: "absent"; correlation: { cashMovementId: string; attemptNumber: number } }
      | { kind: "unresolved" }
    >;
  };
}

export interface PaymentVoucherInvoiceDto extends Record<string, unknown> {
  products: Array<Record<string, unknown>>;
}

export interface PaymentVoucherService {
  amountToPesos: (amount: number) => number;
  mapBillType: (billType: string) => number;
  buildInvoice: (payment: PaymentVoucherPayment, billType: string, ptoVenta: number) => PaymentVoucherInvoiceDto;
  issue: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  reconcile: (input: { cashMovementId: string }) => Promise<Record<string, unknown>>;
  print: (input: { cashMovementId: string }) => Promise<Record<string, unknown>>;
}

const BILL_TYPE_CODES: Readonly<Record<string, number>> = {
  "Factura A": 1,
  "Factura B": 6,
  "Factura C": 11,
};

type SupportedBillType = "Factura A" | "Factura B" | "Factura C";
type PaymentVoucherStatus = "NOT_REQUIRED" | "PENDING" | "ISSUING" | "AUTHORIZED" | "FAILED" | "UNKNOWN";

export interface PaymentVoucherStatusDTO extends Record<string, unknown> {
  status: PaymentVoucherStatus | "MISSING";
  proposedBillType?: SupportedBillType;
}

function isSupportedBillType(value: unknown): value is SupportedBillType {
  return value === "Factura A" || value === "Factura B" || value === "Factura C";
}

const SAFE_ERROR_CODES = new Set([
  "PREFLIGHT_REJECTED",
  "AFIP_REJECTED",
  "REMOTE_OUTCOME_UNKNOWN",
  "TOTAL_MISMATCH",
  "PERSISTENCE_FAILED",
]);

function requirePositiveWholePesos(amount: number): number {
  const pesos = toPositiveWholePesos(amount);
  if (pesos === null) throw new Error("El importe del pago no es válido para facturar");
  return pesos;
}

/** Parse AFIP evidence without normalizing or rounding fractional values. */
function parseAfipWholePesos(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_WHOLE_PESO_AMOUNT ? value : null;
  }
  if (typeof value !== "string" || value.length > 32 || !/^\d+(?:\.0+)?$/.test(value)) return null;

  const pesos = Number(value);
  return Number.isSafeInteger(pesos) && pesos > 0 && pesos <= MAX_WHOLE_PESO_AMOUNT ? pesos : null;
}

/** Keep only faithful, schema-bounded decimal observations; never round evidence. */
function parseObservedTotal(value: unknown): number | null {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== "string" || text.length > 32 || !/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const total = Number(text);
  return Number.isFinite(total) && total >= 0 && total <= MAX_WHOLE_PESO_AMOUNT ? total : null;
}

function boundedPositiveInteger(value: unknown, maximum = 2_147_483_647): number | null {
  const candidate = typeof value === "number" ? value
    : typeof value === "string" && value.length <= 10 && /^\d+$/.test(value) ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(candidate) && candidate > 0 && candidate <= maximum ? candidate : null;
}

function safeObservedDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value !== "string" || value.length > 64 || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeAfipObservations(value: Record<string, unknown>): Record<string, unknown> {
  const total = parseObservedTotal(value.total);
  const cae = typeof value.cae === "string" && /^\d{14}$/.test(value.cae) ? value.cae : null;
  const invoiceNumber = boundedPositiveInteger(value.invoiceNumber);
  const pointOfSale = boundedPositiveInteger(value.pointOfSale, 99_999);
  const issuedAt = safeObservedDate(value.issuedAt);
  return {
    ...(total !== null ? { observedTotalPesos: total } : {}),
    ...(cae ? { observedCae: cae } : {}),
    ...(invoiceNumber !== null ? { observedInvoiceNumber: invoiceNumber } : {}),
    ...(pointOfSale !== null ? { observedPointOfSale: pointOfSale } : {}),
    ...(issuedAt ? { observedIssuedAt: issuedAt } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeResultStatus(status: string): PaymentVoucherStatus {
  return ["NOT_REQUIRED", "PENDING", "ISSUING", "AUTHORIZED", "FAILED", "UNKNOWN"].includes(status)
    ? status as PaymentVoucherStatus
    : "UNKNOWN";
}

function billTypeCode(billType: string): number {
  const code = BILL_TYPE_CODES[billType];
  if (!code) throw new Error("Seleccione Factura A, Factura B o Factura C");
  return code;
}

function recipientFor(payment: PaymentVoucherPayment, billType: string): RecipientSnapshot {
  const client = payment.order.client;
  if (!client?.id) throw new Error("El pago necesita un cliente asociado antes de emitir una factura");
  const legacyCuit = client.cuit?.trim() || client.documentNumber?.trim() || "";
  const documentType = client.fiscalDocumentType ?? (legacyCuit ? "CUIT" : null);
  const documentNumber = client.fiscalDocumentType
    ? client.fiscalDocumentNumber?.trim() || null
    : legacyCuit || null;
  if ((documentType === null) !== (documentNumber === null)) {
    throw new Error("Los datos del documento fiscal del cliente están incompletos");
  }
  return {
    name: client.name?.trim() || "",
    ivaCondition: billType === "Factura B" ? "Consumidor Final" : client.ivaCondition?.trim() || "Consumidor Final",
    documentType,
    documentNumber,
  };
}

function configuredPointOfSale(payment: PaymentVoucherPayment, proposed: unknown): number {
  const configured = payment.business?.ptoVenta;
  if (!configured || configured.length === 0
    || configured.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error("No hay puntos de venta válidos configurados para facturar");
  }
  if (typeof proposed !== "number" || !Number.isSafeInteger(proposed) || proposed <= 0 || !configured.includes(proposed)) {
    throw new Error("Seleccione un punto de venta configurado");
  }
  return proposed;
}

function safeFiscalSnapshot(invoice: PaymentVoucherInvoiceDto): Record<string, unknown> {
  const recipient: RecipientSnapshot = {
    name: typeof invoice.client === "string" ? invoice.client : "",
    ivaCondition: typeof invoice.clientIvaCondition === "string" ? invoice.clientIvaCondition : "",
    documentType: invoice.clientDocumentType === "CUIT" || invoice.clientDocumentType === "DNI" ? invoice.clientDocumentType : null,
    documentNumber: typeof invoice.clientDocumentNumber === "string" ? invoice.clientDocumentNumber : null,
  };
  return {
    client: recipient.name,
    clientIvaCondition: recipient.ivaCondition,
    recipient,
  };
}

function isRecipientSnapshot(value: unknown): value is RecipientSnapshot {
  if (!isRecord(value)
    || typeof value.name !== "string" || value.name.trim() === ""
    || typeof value.ivaCondition !== "string" || value.ivaCondition.trim() === "") {
    return false;
  }

  const absentDocument = (value.documentType === null || value.documentType === undefined)
    && (value.documentNumber === null || value.documentNumber === undefined);
  const validDocument = (value.documentType === "CUIT" || value.documentType === "DNI")
    && typeof value.documentNumber === "string" && value.documentNumber.trim() !== "";
  return absentDocument || validDocument;
}

function printAmountPesos(value: unknown): number {
  const pesos = parseAfipWholePesos(value);
  if (pesos === null) {
    throw new Error("El comprobante de este pago no está autorizado para impresión");
  }
  return pesos;
}

function validIssueDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validateAuthorizedPrintRecord(
  value: Record<string, unknown>,
  payment: PaymentVoucherPayment,
): Record<string, unknown> {
  if (value.status !== "AUTHORIZED") throw new Error("El comprobante de este pago no está autorizado para impresión");

  const billType = value.billType;
  if (typeof billType !== "string" || billTypeCode(billType) !== value.afipVoucherType) {
    throw new Error("El comprobante de este pago no está autorizado para impresión");
  }

  if (typeof value.cae !== "string" || !/^\d{14}$/.test(value.cae)) {
    throw new Error("El comprobante de este pago no está autorizado para impresión");
  }

  const invoiceNumber = value.invoiceNumber;
  const pointOfSale = value.invoicePointOfSale ?? value.pointOfSale;
  const issuedAt = validIssueDate(value.issuedAt);
  if (typeof invoiceNumber !== "number" || !Number.isSafeInteger(invoiceNumber) || invoiceNumber <= 0
    || typeof pointOfSale !== "number" || !Number.isSafeInteger(pointOfSale) || pointOfSale <= 0
    || !issuedAt) {
    throw new Error("El comprobante de este pago no está autorizado para impresión");
  }

  const paymentPesos = amountToPesosForPrint(payment.total);
  const hasAmount = Object.prototype.hasOwnProperty.call(value, "amount");
  const hasTotal = Object.prototype.hasOwnProperty.call(value, "total");
  if (!hasAmount && !hasTotal) throw new Error("El comprobante de este pago no está autorizado para impresión");
  const voucherPesos = printAmountPesos(hasAmount ? value.amount : value.total);
  if (voucherPesos !== paymentPesos
    || (hasAmount && hasTotal && printAmountPesos(value.total) !== voucherPesos)) {
    throw new Error("El comprobante de este pago no está autorizado para impresión");
  }

  if ((value.caeVencimiento !== undefined && value.caeVencimiento !== null && typeof value.caeVencimiento !== "string")
    || (value.qrData !== undefined && value.qrData !== null && typeof value.qrData !== "string")) {
    throw new Error("El comprobante de este pago no está autorizado para impresión");
  }

  const fiscalSnapshot = validatedPrintFiscalSnapshot(value.fiscalSnapshot, billType);

  return {
    status: "AUTHORIZED",
    billType,
    afipVoucherType: billTypeCode(billType),
    amount: voucherPesos,
    cae: value.cae,
    ...(typeof value.caeVencimiento === "string" ? { caeVencimiento: value.caeVencimiento } : {}),
    ...(typeof value.qrData === "string" ? { qrData: value.qrData } : {}),
    invoiceNumber,
    invoicePointOfSale: pointOfSale,
    pointOfSale,
    issuedAt,
    fiscalSnapshot,
  };
}

function validatedPrintFiscalSnapshot(value: unknown, billType: string): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.recipient)) {
    throw new Error("El comprobante de este pago no está autorizado para impresión");
  }

  const candidate = value.recipient;
  if (typeof candidate.name !== "string" || candidate.name.trim() === ""
    || typeof candidate.ivaCondition !== "string" || candidate.ivaCondition.trim() === "") {
    throw new Error("El comprobante de este pago no está autorizado para impresión");
  }

  if (billType === "Factura B" && candidate.ivaCondition.trim() !== "Consumidor Final") {
    throw new Error("El comprobante de este pago no está autorizado para impresión");
  }

  const documentType = candidate.documentType;
  const documentNumber = candidate.documentNumber;
  const documentIsAbsent = (documentType === undefined || documentType === null)
    && (documentNumber === undefined || documentNumber === null);
  if (!documentIsAbsent && (documentType !== "CUIT" && documentType !== "DNI"
    || typeof documentNumber !== "string" || documentNumber.trim() === "")) {
    throw new Error("El comprobante de este pago no está autorizado para impresión");
  }

  const recipient: RecipientSnapshot = {
    name: candidate.name.trim(),
    ivaCondition: candidate.ivaCondition.trim(),
    documentType: documentIsAbsent ? null : documentType as "CUIT" | "DNI",
    // Keep the value textual so identifiers such as DNI 00123456 retain zeroes.
    documentNumber: documentIsAbsent ? null : (documentNumber as string).trim(),
  };
  return {
    client: recipient.name,
    clientIvaCondition: recipient.ivaCondition,
    recipient,
  };
}

function amountToPesosForPrint(amount: number): number {
  try {
    return requirePositiveWholePesos(amount);
  } catch {
    throw new Error("El comprobante de este pago no está autorizado para impresión");
  }
}

function authorizedPrintDto(value: Record<string, unknown>): Record<string, unknown> {
  const snapshot = isRecord(value.fiscalSnapshot) ? value.fiscalSnapshot : {};
  const snapshotRecipient = isRecord(snapshot.recipient) ? snapshot.recipient : {};
  const storedTotal = typeof value.amount === "number" ? value.amount : Number(value.amount ?? value.total);
  return {
    status: "AUTHORIZED",
    billType: value.billType,
    afipVoucherType: value.afipVoucherType,
    total: storedTotal,
    cae: value.cae,
    caeVencimiento: value.caeVencimiento,
    qrData: value.qrData,
    invoiceNumber: value.invoiceNumber,
    pointOfSale: value.invoicePointOfSale ?? value.pointOfSale,
    issuedAt: value.issuedAt,
    recipient: {
      name: snapshotRecipient.name,
      ivaCondition: snapshotRecipient.ivaCondition,
      documentType: snapshotRecipient.documentType === "CUIT" || snapshotRecipient.documentType === "DNI"
        ? snapshotRecipient.documentType : null,
      documentNumber: typeof snapshotRecipient.documentNumber === "string" ? snapshotRecipient.documentNumber : null,
    },
    fiscalSnapshot: {
      client: snapshot.client,
      clientIvaCondition: snapshot.clientIvaCondition,
      recipient: snapshotRecipient,
    },
    line: { description: "Pago parcial", amount: storedTotal, quantity: 1 },
  };
}

export function createPaymentVoucherService(dependencies: PaymentVoucherDependencies): PaymentVoucherService {
  const amountToPesos = requirePositiveWholePesos;
  const mapBillType = billTypeCode;

  const buildInvoice = (
    payment: PaymentVoucherPayment,
    selectedBillType: string,
    proposedPtoVenta: number,
    reservedRecipient?: RecipientSnapshot,
  ): PaymentVoucherInvoiceDto => {
    const code = mapBillType(selectedBillType);
    const total = amountToPesos(payment.total);
    if (payment.businessId !== payment.order.businessId) throw new Error("Pago no encontrado");
    const recipient = reservedRecipient ?? recipientFor(payment, selectedBillType);
    const ptoVenta = configuredPointOfSale(payment, proposedPtoVenta);
    const digits = recipient.documentNumber?.replace(/\D/g, "") ?? "";
    const numericDocument = /^\d+$/.test(digits) ? Number(digits) : 0;
    return {
      id: payment.id,
      seller: payment.order.seller || "",
      typeDocument: recipient.documentType ?? "",
      IVACondition: recipient.ivaCondition,
      twoMethods: false,
      billType: selectedBillType,
      paidMethod: payment.paidMethod || "Pago",
      clientId: payment.order.client?.id ?? "",
      client: recipient.name,
      clientIvaCondition: recipient.ivaCondition,
      clientDocumentType: recipient.documentType,
      clientDocumentNumber: recipient.documentNumber,
      recipient,
      discount: 0,
      documentNumber: Number.isSafeInteger(numericDocument) ? numericDocument : 0,
      total,
      totalWithDiscount: total,
      date: (payment.order.date ?? new Date()).toISOString(),
      ptoVenta,
      products: [{
        id: payment.id,
        code: "",
        description: "Pago parcial",
        amount: 1,
        price: total,
        salePrice: total,
      }],
      afipVoucherType: code,
    };
  };

  const issueCore = async (
    input: Record<string, unknown>,
    markRemoteDispatchPossible: () => void,
  ): Promise<Record<string, unknown>> => {
    const cashMovementId = typeof input.cashMovementId === "string" ? input.cashMovementId.trim() : "";
    const billType = typeof input.billType === "string" ? input.billType : "";
    const proposedPtoVenta = input.ptoVenta;
    const retry = input.retry === true;
    if (!cashMovementId || cashMovementId.length > 200) throw new Error("Pago no encontrado");
    mapBillType(billType);

    const session = await dependencies.auth();
    const actorBusinessId = session?.user.businessId;
    if (!session?.user.id || !actorBusinessId) throw new Error("No autorizado");
    const payment = await dependencies.repository.findPayment(cashMovementId, actorBusinessId);
    if (!payment || payment.businessId !== actorBusinessId || payment.order.businessId !== actorBusinessId) {
      throw new Error("Pago no encontrado");
    }
    const existing = await dependencies.repository.getVoucher(cashMovementId, actorBusinessId);
    const failUnclaimedPreparation = async (): Promise<void> => {
      if (existing?.status !== "PENDING" || existing.currentAttemptStatus !== "PREPARING"
        || typeof existing.currentAttempt !== "number" || !dependencies.repository.failPreparing) return;
      await dependencies.repository.transaction(() => dependencies.repository.failPreparing!({
        paymentId: cashMovementId,
        businessId: actorBusinessId,
        attempt: existing.currentAttempt as number,
      }));
    };
    if (existing?.status === "NOT_REQUIRED") return { paymentRecorded: true, voucherStatus: "NOT_REQUIRED" };
    if (existing?.status === "AUTHORIZED") return { paymentRecorded: true, voucherStatus: "AUTHORIZED" };
    if (existing?.status === "UNKNOWN") return { paymentRecorded: true, voucherStatus: "UNKNOWN", reconciliationRequired: true };
    const isReservedPreparation = existing?.status === "PENDING" && existing.currentAttemptStatus === "PREPARING";
    if (isReservedPreparation && (
      existing.billType !== billType
      || existing.invoicePointOfSale !== proposedPtoVenta
      || (typeof existing.currentAttemptBillType === "string" && existing.currentAttemptBillType !== billType)
      || (typeof existing.currentAttemptPointOfSale === "number" && existing.currentAttemptPointOfSale !== proposedPtoVenta)
    )) {
      return { paymentRecorded: true, voucherStatus: "PENDING" };
    }
    if ((existing?.status === "FAILED" || existing?.status === "PENDING" || existing?.status === "ISSUING") && !retry) {
      if (existing.status === "FAILED") return { paymentRecorded: true, voucherStatus: "FAILED" };
      if (existing.status === "ISSUING"
        || (existing.status === "PENDING" && existing.currentAttemptStatus !== "PREPARING")) {
        return { paymentRecorded: true, voucherStatus: safeResultStatus(existing.status) };
      }
    }
    if (existing?.status === "FAILED" && !retry) return { paymentRecorded: true, voucherStatus: "FAILED" };
    if (retry && existing && existing.status !== "FAILED") {
      return { paymentRecorded: true, voucherStatus: safeResultStatus(String(existing.status ?? "UNKNOWN")) };
    }
    let recipient: RecipientSnapshot;
    let ptoVenta: number;
    try {
      if (isReservedPreparation) {
        if (!isRecipientSnapshot(existing.currentRecipientSnapshot)) {
          throw new Error("reserved_payment_recipient_snapshot_invalid");
        }
        recipient = existing.currentRecipientSnapshot;
      } else {
        recipient = recipientFor(payment, billType);
      }
      ptoVenta = configuredPointOfSale(payment, proposedPtoVenta);
    } catch {
      await failUnclaimedPreparation();
      return { paymentRecorded: true, voucherStatus: "FAILED", message: "Los datos fiscales no son válidos; el pago quedó registrado" };
    }
    let amountPesos: number;
    try {
      amountPesos = amountToPesos(payment.total);
    } catch {
      await failUnclaimedPreparation();
      return {
        paymentRecorded: true,
        voucherStatus: "FAILED",
        message: "El importe del pago no es válido; no se inició la emisión",
      };
    }
    if (isReservedPreparation) {
      const reservedAmount = existing.currentAttemptAmount ?? existing.amount;
      if (typeof reservedAmount !== "number" || amountToPesos(reservedAmount) !== amountPesos) {
        await failUnclaimedPreparation();
        return { paymentRecorded: true, voucherStatus: "FAILED", message: "El importe reservado no coincide con el pago; no se inició la emisión" };
      }
    }
    if (existing?.status === "FAILED" && typeof existing.amount === "number"
      && amountToPesos(existing.amount) !== amountPesos) {
      await failUnclaimedPreparation();
      return { paymentRecorded: true, voucherStatus: "FAILED", message: "El importe del pago cambió; el pago quedó registrado" };
    }
    let afipEligible = false;
    try {
      afipEligible = await dependencies.repository.isAfipEligible(actorBusinessId);
    } catch {
      await failUnclaimedPreparation();
      return { paymentRecorded: true, voucherStatus: "FAILED", message: "No se pudo validar la habilitación AFIP/ARCA; el pago quedó registrado" };
    }
    if (!afipEligible) {
      await failUnclaimedPreparation();
      return { paymentRecorded: true, voucherStatus: "FAILED", message: "La facturación AFIP/ARCA no está habilitada; el pago quedó registrado" };
    }

    let invoice: PaymentVoucherInvoiceDto;
    try {
      invoice = buildInvoice(payment, billType, ptoVenta, recipient);
    } catch {
      await failUnclaimedPreparation();
      return { paymentRecorded: true, voucherStatus: "FAILED", message: "Los datos de la factura no son válidos; el pago quedó registrado" };
    }
    const claim = await dependencies.repository.transaction(() => dependencies.repository.claim({
      paymentId: cashMovementId,
      businessId: actorBusinessId,
      billType,
      amount: amountPesos,
      ptoVenta,
      recipientSnapshot: recipient,
    }));
    if (!claim.acquired) {
      const status = safeResultStatus(claim.status);
      return { paymentRecorded: true, voucherStatus: status, ...(status === "UNKNOWN" ? { reconciliationRequired: true } : {}) };
    }

    const persistFailure = async (status: "FAILED" | "UNKNOWN", code: string): Promise<void> => {
      const safeErrorCode = SAFE_ERROR_CODES.has(code) ? code : "REMOTE_OUTCOME_UNKNOWN";
      await dependencies.repository.transaction(() => dependencies.repository.persistFailure({
        paymentId: cashMovementId,
        businessId: actorBusinessId,
        attempt: claim.attempt,
        status,
        safeErrorCode,
      }));
    };

    let prepared: { ok: true; capability: unknown } | { ok: false; definite: true };
    try {
      prepared = await dependencies.afip.prepare(invoice);
    } catch {
      await persistFailure("FAILED", "PREFLIGHT_REJECTED");
      return { paymentRecorded: true, voucherStatus: "FAILED", message: "No se pudo preparar la factura; el pago quedó registrado" };
    }
    if (!prepared.ok) {
      await persistFailure("FAILED", "PREFLIGHT_REJECTED");
      return { paymentRecorded: true, voucherStatus: "FAILED", message: "ARCA no pudo validar la factura; el pago quedó registrado" };
    }

    let remoteResult: Awaited<ReturnType<PaymentVoucherDependencies["afip"]["issue"]>>;
    let dispatchPossible = false;
    try {
      remoteResult = await dependencies.afip.issue(prepared.capability, async () => {
        if (!dependencies.repository.markDispatched) {
          throw new Error("payment_voucher_dispatch_transition_unavailable");
        }
        await dependencies.repository.transaction(() => dependencies.repository.markDispatched!({
          paymentId: cashMovementId,
          businessId: actorBusinessId,
          attempt: claim.attempt,
        }));
        dispatchPossible = true;
        markRemoteDispatchPossible();
      });
    } catch {
      if (!dispatchPossible) {
        try { await persistFailure("FAILED", "PREFLIGHT_REJECTED"); } catch { /* No remote request was made. */ }
        return { paymentRecorded: true, voucherStatus: "FAILED", message: "No se pudo preparar la factura; el pago quedó registrado" };
      }
      try { await persistFailure("UNKNOWN", "REMOTE_OUTCOME_UNKNOWN"); } catch { /* Preserve the fail-closed response. */ }
      return { paymentRecorded: true, voucherStatus: "UNKNOWN", reconciliationRequired: true };
    }
    if (remoteResult.kind === "rejected") {
      await persistFailure("FAILED", "AFIP_REJECTED");
      return { paymentRecorded: true, voucherStatus: "FAILED", message: "ARCA rechazó la factura; el pago quedó registrado" };
    }
    if (remoteResult.kind === "unknown") {
      try {
        await dependencies.repository.transaction(() => dependencies.repository.persistFailure({
          paymentId: cashMovementId,
          businessId: actorBusinessId,
          attempt: claim.attempt,
          status: "UNKNOWN",
          safeErrorCode: "REMOTE_OUTCOME_UNKNOWN",
          ...safeAfipObservations(remoteResult),
        }));
      } catch { /* Preserve the fail-closed response. */ }
      return { paymentRecorded: true, voucherStatus: "UNKNOWN", reconciliationRequired: true };
    }

    const authorizedPesos = parseAfipWholePesos(remoteResult.total);
    const hasValidAuthorizationIdentity = /^\d{14}$/.test(remoteResult.cae)
      && Number.isSafeInteger(remoteResult.invoiceNumber)
      && remoteResult.invoiceNumber > 0
      && remoteResult.issuedAt instanceof Date
      && !Number.isNaN(remoteResult.issuedAt.getTime());
    if (authorizedPesos !== amountPesos || remoteResult.pointOfSale !== ptoVenta || !hasValidAuthorizationIdentity) {
      try {
        await dependencies.repository.transaction(() => dependencies.repository.persistFailure({
          paymentId: cashMovementId,
          businessId: actorBusinessId,
          attempt: claim.attempt,
          status: "UNKNOWN",
          safeErrorCode: authorizedPesos !== amountPesos ? "TOTAL_MISMATCH" : "REMOTE_OUTCOME_UNKNOWN",
          ...safeAfipObservations(remoteResult),
        }));
      } catch { /* Keep the issuance blocked. */ }
      return { paymentRecorded: true, voucherStatus: "UNKNOWN", reconciliationRequired: true };
    }

    const persistenceData: Record<string, unknown> = {
      paymentId: cashMovementId,
      businessId: actorBusinessId,
      attempt: claim.attempt,
      status: "AUTHORIZED",
      billType,
      afipVoucherType: mapBillType(billType),
      amount: amountPesos,
      total: amountPesos,
      cae: remoteResult.cae,
      caeVencimiento: remoteResult.caeVencimiento,
      qrData: remoteResult.qrData,
      invoiceNumber: remoteResult.invoiceNumber,
      invoicePointOfSale: remoteResult.pointOfSale,
      pointOfSale: remoteResult.pointOfSale,
      issuedAt: remoteResult.issuedAt,
      fiscalSnapshot: safeFiscalSnapshot(invoice),
    };
    try {
      await dependencies.repository.transaction(() => dependencies.repository.persistAuthorized(persistenceData));
    } catch {
      try { await persistFailure("UNKNOWN", "PERSISTENCE_FAILED"); } catch { /* Never turn a possible authorization into a retryable result. */ }
      return { paymentRecorded: true, voucherStatus: "UNKNOWN", reconciliationRequired: true };
    }
    return { paymentRecorded: true, voucherStatus: "AUTHORIZED" };
  };

  const issue = async (input: Record<string, unknown>): Promise<Record<string, unknown>> => {
    let remoteDispatchPossible = false;
    try {
      return await issueCore(input, () => { remoteDispatchPossible = true; });
    } catch {
      // The durable transition to ISSUING happens before this boundary. Before
      // it, no remote request can have happened; after it, the result must fail
      // closed because dispatch may have occurred.
      throw new PaymentVoucherIssueError(remoteDispatchPossible ? "UNKNOWN" : "FAILED");
    }
  };

  const reconcile = async (input: { cashMovementId: string }): Promise<Record<string, unknown>> => {
    const session = await dependencies.auth();
    const businessId = session?.user.businessId;
    if (!session?.user.id || !businessId || !input.cashMovementId) throw new Error("No autorizado");
    const payment = await dependencies.repository.findPayment(input.cashMovementId, businessId);
    if (!payment || payment.businessId !== businessId || payment.order.businessId !== businessId) throw new Error("Pago no encontrado");
    const current = await dependencies.repository.getVoucher(input.cashMovementId, businessId);
    if (!current) return { status: "UNKNOWN", reconciliationRequired: true };
    if (current.status !== "UNKNOWN") return { status: safeResultStatus(String(current.status)) };
    const currentAttempt = current.currentAttempt;
    if (typeof currentAttempt !== "number" || !Number.isSafeInteger(currentAttempt) || currentAttempt <= 0) {
      return { status: "UNKNOWN", reconciliationRequired: true };
    }

    const result = await dependencies.afip.reconcile(input.cashMovementId, currentAttempt);
    if (result.kind === "unresolved") return { status: "UNKNOWN", reconciliationRequired: true };
    if (!result.correlation || result.correlation.cashMovementId !== input.cashMovementId
      || result.correlation.attemptNumber !== currentAttempt) {
      if (result.kind === "authorized") {
        const uncorrelatedTotal = Object.prototype.hasOwnProperty.call(result.voucher, "total")
          ? result.voucher.total
          : result.voucher.amount;
        const observedTotal = parseObservedTotal(uncorrelatedTotal);
        // A fractional amount is safe to record as an observation, but never
        // compare it with the payment or attach the uncorrelated voucher.
        if (observedTotal !== null && parseAfipWholePesos(uncorrelatedTotal) === null) {
          await dependencies.repository.transaction(() => dependencies.repository.persistFailure({
            paymentId: input.cashMovementId,
            businessId,
            attempt: currentAttempt,
            status: "UNKNOWN",
            safeErrorCode: "TOTAL_MISMATCH",
            observedTotalPesos: observedTotal,
          }));
        }
      }
      return { status: "UNKNOWN", reconciliationRequired: true };
    }
    if (result.kind === "absent") {
      await dependencies.repository.transaction(() => dependencies.repository.persistFailure({
        paymentId: input.cashMovementId,
        businessId,
        attempt: currentAttempt,
        status: "FAILED",
        safeErrorCode: "AFIP_REJECTED",
      }));
      return { status: "FAILED", retryAllowed: true };
    }
    const voucher = result.voucher;
    const total = Object.prototype.hasOwnProperty.call(voucher, "total") ? voucher.total : voucher.amount;
    const reconciledPesos = parseAfipWholePesos(total);
    const paymentPesos = amountToPesos(payment.total);
    const attemptBillType = current.currentAttemptBillType;
    const attemptPtoVenta = current.currentAttemptPointOfSale;
    const attemptAmount = current.currentAttemptAmount;
    const attemptRecipient = current.currentRecipientSnapshot;
    const voucherPtoVenta = voucher.invoicePointOfSale ?? voucher.pointOfSale;
    const invoiceNumber = boundedPositiveInteger(voucher.invoiceNumber);
    const issuedAt = safeObservedDate(voucher.issuedAt);
    const hasValidAuthorizedVoucherIdentity = isSupportedBillType(attemptBillType)
      && voucher.billType === attemptBillType
      && voucher.afipVoucherType === billTypeCode(attemptBillType)
      && typeof attemptPtoVenta === "number"
      && voucherPtoVenta === attemptPtoVenta
      && invoiceNumber !== null
      && typeof voucher.cae === "string"
      && /^\d{14}$/.test(voucher.cae)
      && issuedAt !== null
      && isRecipientSnapshot(attemptRecipient);

    if (typeof attemptAmount !== "number" || !Number.isSafeInteger(attemptAmount)
      || attemptAmount !== paymentPesos || reconciledPesos === null || reconciledPesos !== paymentPesos) {
      await dependencies.repository.transaction(() => dependencies.repository.persistFailure({
        paymentId: input.cashMovementId,
        businessId,
        attempt: currentAttempt,
        status: "UNKNOWN",
        safeErrorCode: "TOTAL_MISMATCH",
        ...safeAfipObservations(voucher),
      }));
      return { status: "UNKNOWN", reconciliationRequired: true };
    }
    if (!hasValidAuthorizedVoucherIdentity) {
      await dependencies.repository.transaction(() => dependencies.repository.persistFailure({
        paymentId: input.cashMovementId,
        businessId,
        attempt: currentAttempt,
        status: "UNKNOWN",
        safeErrorCode: "REMOTE_OUTCOME_UNKNOWN",
        ...safeAfipObservations(voucher),
      }));
      return { status: "UNKNOWN", reconciliationRequired: true };
    }
    const recipient = attemptRecipient as RecipientSnapshot;
    const authorizedBillType = attemptBillType as SupportedBillType;
    await dependencies.repository.transaction(() => dependencies.repository.persistAuthorized({
      paymentId: input.cashMovementId,
      businessId,
      attempt: currentAttempt,
      status: "AUTHORIZED",
      billType: authorizedBillType,
      afipVoucherType: billTypeCode(authorizedBillType),
      amountPesos: paymentPesos,
      amount: paymentPesos,
      total,
      cae: voucher.cae,
      invoiceNumber: boundedPositiveInteger(voucher.invoiceNumber) as number,
      pointOfSale: attemptPtoVenta,
      issuedAt,
      fiscalSnapshot: {
        client: recipient.name,
        clientIvaCondition: recipient.ivaCondition,
        recipient,
      },
    }));
    return { status: "AUTHORIZED" };
  };

  const print = async (input: { cashMovementId: string }): Promise<Record<string, unknown>> => {
    const session = await dependencies.auth();
    const businessId = session?.user.businessId;
    const cashMovementId = typeof input.cashMovementId === "string" ? input.cashMovementId.trim() : "";
    if (!session?.user.id || !businessId || !cashMovementId || cashMovementId.length > 200) throw new Error("No autorizado");
    const payment = await dependencies.repository.findPayment(cashMovementId, businessId);
    if (!payment || payment.id !== cashMovementId || payment.businessId !== businessId
      || payment.order.businessId !== businessId) throw new Error("Pago no encontrado");
    const voucher = await dependencies.repository.getVoucher(cashMovementId, businessId);
    if (!voucher) {
      throw new Error("El comprobante de este pago no está autorizado para impresión");
    }

    const trustedVoucher = validateAuthorizedPrintRecord(voucher, payment);
    return authorizedPrintDto(trustedVoucher);
  };

  return { amountToPesos, mapBillType, buildInvoice, issue, reconcile, print };
}

type VoucherTransactionClient = Prisma.TransactionClient;
const transactionStorage = new AsyncLocalStorage<VoucherTransactionClient>();

function currentClient(): VoucherTransactionClient | PrismaClient {
  return transactionStorage.getStore() ?? db;
}

function safePersistedVoucher(voucher: {
  id: string;
  status: string;
  amount: Prisma.Decimal;
  billType: string;
  afipVoucherType: number | null;
  invoiceNumber: number | null;
  invoicePointOfSale: number | null;
  cae: string | null;
  caeVencimiento: string | null;
  qrData: string | null;
  issuedAt: Date | null;
  fiscalSnapshot: Prisma.JsonValue | null;
  currentAttempt: number;
}): Record<string, unknown> {
  return {
    id: voucher.id,
    status: voucher.status,
    amount: Number(voucher.amount.toString()),
    billType: voucher.billType,
    afipVoucherType: voucher.afipVoucherType,
    invoiceNumber: voucher.invoiceNumber,
    invoicePointOfSale: voucher.invoicePointOfSale,
    cae: voucher.cae,
    caeVencimiento: voucher.caeVencimiento,
    qrData: voucher.qrData,
    issuedAt: voucher.issuedAt,
    fiscalSnapshot: voucher.fiscalSnapshot,
    currentAttempt: voucher.currentAttempt,
  };
}

const databaseDependencies: PaymentVoucherDependencies = {
  auth: async () => {
    const session = await auth();
    const user = session?.user;
    if (!user?.id) return null;
    return {
      user: {
        id: user.id,
        ...(user.businessId ? { businessId: user.businessId } : {}),
        ...(user.role ? { role: user.role } : {}),
        ...(user.business ? { business: user.business } : {}),
      },
    };
  },
  repository: {
    findPayment: async (id, businessId) => {
      const movement = await db.cashMovement.findFirst({
        where: { id, businessId, order: { is: { businessId } } },
        include: {
          order: { include: { client: true } },
          business: { select: { name: true, ptoVenta: true, condicionIva: true } },
        },
      });
      if (!movement?.order) return null;
      const client = movement.order.client;
      return {
        id: movement.id,
        businessId: movement.businessId,
        total: movement.total,
        paidMethod: movement.paidMethod,
        business: {
          name: movement.business.name,
          ptoVenta: movement.business.ptoVenta,
          condicionIva: movement.business.condicionIva,
        },
        order: {
          id: movement.order.id,
          businessId: movement.order.businessId,
          total: movement.order.total,
          seller: movement.order.seller,
          date: movement.order.date,
          client: client ? {
            id: client.id,
            name: client.name,
            documentNumber: client.fiscalDocumentNumber ?? client.cuit,
            cuit: client.cuit,
            ivaCondition: client.ivaCondition,
            fiscalDocumentType: client.fiscalDocumentType === "CUIT" || client.fiscalDocumentType === "DNI"
              ? client.fiscalDocumentType : null,
            fiscalDocumentNumber: client.fiscalDocumentNumber,
          } : null,
        },
      };
    },
    isAfipEligible: async (businessId) => {
      const business = await db.business.findUnique({
        where: { id: businessId },
        select: { id: true, accountStatus: true, features: { select: { hasAfipBilling: true } } },
      });
      return business?.id === businessId && business.accountStatus !== "MOROSO"
        && business.features?.hasAfipBilling === true;
    },
    claim: async ({ paymentId, businessId, billType, amount, ptoVenta, recipientSnapshot }) => {
      const client = currentClient();
      let voucher = await client.paymentVoucher.findUnique({ where: { cashMovementId: paymentId } });
      if (voucher && voucher.businessId !== businessId) return { status: "UNKNOWN", attempt: voucher.currentAttempt, acquired: false };
      if (!voucher) {
        try {
          const reservationTime = new Date();
          voucher = await client.paymentVoucher.create({
            data: {
              cashMovementId: paymentId,
              businessId,
              status: "PENDING",
              amount: new Prisma.Decimal(amount),
              billType,
              afipVoucherType: billTypeCode(billType),
              invoicePointOfSale: ptoVenta,
              currentAttempt: 1,
              createdAt: reservationTime,
              updatedAt: reservationTime,
              attempts: { create: {
                attemptNumber: 1,
                status: "PREPARING",
                billType,
                amount: new Prisma.Decimal(amount),
                invoicePointOfSale: ptoVenta,
                recipientSnapshot: recipientSnapshot as unknown as Prisma.InputJsonValue,
                startedAt: reservationTime,
              } },
            },
          });
          return { status: "PENDING", attempt: 1, acquired: true };
        } catch (error: unknown) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
          voucher = await client.paymentVoucher.findUnique({ where: { cashMovementId: paymentId } });
          if (!voucher) throw error;
        }
      }
      if (voucher.status === "AUTHORIZED" || voucher.status === "UNKNOWN") {
        return { status: voucher.status, attempt: voucher.currentAttempt, acquired: false };
      }
      if (voucher.status === "ISSUING" || voucher.status === "PENDING") {
        if (Date.now() - voucher.updatedAt.getTime() > 120_000) {
          const staleStatus = voucher.status === "PENDING" ? "FAILED" : "UNKNOWN";
          const staleCode = voucher.status === "PENDING" ? "PREFLIGHT_REJECTED" : "REMOTE_OUTCOME_UNKNOWN";
          const changed = await client.paymentVoucher.updateMany({
            where: { id: voucher.id, status: voucher.status, updatedAt: voucher.updatedAt },
            data: { status: staleStatus, lastErrorCode: staleCode },
          });
          if (changed.count === 1) {
            await client.paymentVoucherAttempt.updateMany({
              where: { paymentVoucherId: voucher.id, attemptNumber: voucher.currentAttempt, status: { in: ["PREPARING", "ISSUING"] } },
              data: { status: staleStatus, safeErrorCode: staleCode, finishedAt: new Date() },
            });
            return { status: staleStatus, attempt: voucher.currentAttempt, acquired: false };
          }
          const latest = await client.paymentVoucher.findUnique({ where: { cashMovementId: paymentId } });
          return { status: latest?.status ?? "UNKNOWN", attempt: latest?.currentAttempt ?? voucher.currentAttempt, acquired: false };
        }
        if (voucher.status === "PENDING") {
          const pendingAttempt = await client.paymentVoucherAttempt.findFirst({
            where: { paymentVoucherId: voucher.id, attemptNumber: voucher.currentAttempt, status: "PREPARING" },
          });
          if (!pendingAttempt || pendingAttempt.startedAt.getTime() !== voucher.updatedAt.getTime()) {
            return { status: voucher.status, attempt: voucher.currentAttempt, acquired: false };
          }
          const now = new Date();
          const attemptClaimed = await client.paymentVoucherAttempt.updateMany({
            where: { id: pendingAttempt.id, status: "PREPARING", startedAt: pendingAttempt.startedAt },
            data: { startedAt: now },
          });
          if (attemptClaimed.count !== 1) {
            return { status: voucher.status, attempt: voucher.currentAttempt, acquired: false };
          }
          const voucherClaimed = await client.paymentVoucher.updateMany({
            where: { id: voucher.id, status: "PENDING", updatedAt: voucher.updatedAt },
            data: { updatedAt: new Date(now.getTime() + 1) },
          });
          if (voucherClaimed.count !== 1) throw new Error("payment_voucher_preparation_claim_conflict");
          return { status: voucher.status, attempt: voucher.currentAttempt, acquired: true };
        }
        return { status: voucher.status, attempt: voucher.currentAttempt, acquired: false };
      }
      if (voucher.status !== "FAILED") return { status: "UNKNOWN", attempt: voucher.currentAttempt, acquired: false };

      const attempt = voucher.currentAttempt + 1;
      const retryReservationTime = new Date();
      await client.paymentVoucher.update({
        where: { id: voucher.id, status: "FAILED" },
        data: {
          status: "PENDING",
          amount: new Prisma.Decimal(amount),
          billType,
          afipVoucherType: billTypeCode(billType),
          invoicePointOfSale: ptoVenta,
          currentAttempt: attempt,
          lastErrorCode: null,
          updatedAt: retryReservationTime,
          attempts: { create: {
            attemptNumber: attempt,
            status: "PREPARING",
            billType,
            amount: new Prisma.Decimal(amount),
            invoicePointOfSale: ptoVenta,
            recipientSnapshot: recipientSnapshot as unknown as Prisma.InputJsonValue,
            startedAt: retryReservationTime,
          } },
        },
      });
      return { status: "PENDING", attempt, acquired: true };
    },
    markDispatched: async ({ paymentId, businessId, attempt }) => {
      const client = currentClient();
      const changed = await client.paymentVoucher.updateMany({
        where: { cashMovementId: paymentId, businessId, currentAttempt: attempt, status: "PENDING" },
        data: { status: "ISSUING" },
      });
      if (changed.count !== 1) throw new Error("payment_voucher_dispatch_transition_conflict");
      const attemptChanged = await client.paymentVoucherAttempt.updateMany({
        where: { paymentVoucher: { cashMovementId: paymentId }, attemptNumber: attempt, status: "PREPARING" },
        data: { status: "ISSUING" },
      });
      if (attemptChanged.count !== 1) throw new Error("payment_voucher_attempt_dispatch_transition_conflict");
    },
    failPreparing: async ({ paymentId, businessId, attempt }) => {
      const client = currentClient();
      const voucher = await client.paymentVoucher.findFirst({
        where: { cashMovementId: paymentId, businessId, currentAttempt: attempt, status: "PENDING" },
        select: { id: true, updatedAt: true },
      });
      if (!voucher) return;
      const now = new Date();
      const attemptChanged = await client.paymentVoucherAttempt.updateMany({
        where: {
          paymentVoucherId: voucher.id,
          attemptNumber: attempt,
          status: "PREPARING",
          startedAt: voucher.updatedAt,
        },
        data: { status: "FAILED", safeErrorCode: "PREFLIGHT_REJECTED", finishedAt: now },
      });
      if (attemptChanged.count !== 1) return;
      const voucherChanged = await client.paymentVoucher.updateMany({
        where: { id: voucher.id, businessId, currentAttempt: attempt, status: "PENDING", updatedAt: voucher.updatedAt },
        data: { status: "FAILED", lastErrorCode: "PREFLIGHT_REJECTED" },
      });
      if (voucherChanged.count !== 1) throw new Error("payment_voucher_preflight_transition_conflict");
    },
    persistAuthorized: async (input) => {
      const client = currentClient();
      const paymentId = String(input.paymentId);
      const attempt = Number(input.attempt);
      const statusUpdate = await client.paymentVoucher.updateMany({
        where: { cashMovementId: paymentId, businessId: String(input.businessId), currentAttempt: attempt, status: { in: ["ISSUING", "UNKNOWN"] } },
        data: {
          status: "AUTHORIZED",
          billType: String(input.billType),
          afipVoucherType: Number(input.afipVoucherType),
          amount: new Prisma.Decimal(Number(input.amount)),
          invoiceNumber: Number(input.invoiceNumber),
          invoicePointOfSale: Number(input.invoicePointOfSale ?? input.pointOfSale),
          cae: String(input.cae),
          caeVencimiento: typeof input.caeVencimiento === "string" ? input.caeVencimiento : null,
          qrData: typeof input.qrData === "string" ? input.qrData : null,
          issuedAt: input.issuedAt instanceof Date ? input.issuedAt : new Date(String(input.issuedAt)),
          fiscalSnapshot: input.fiscalSnapshot as Prisma.InputJsonValue,
          lastErrorCode: null,
        },
      });
      if (statusUpdate.count !== 1) throw new Error("payment_voucher_transition_conflict");
      const attemptUpdate = await client.paymentVoucherAttempt.updateMany({
        where: { paymentVoucher: { cashMovementId: paymentId }, attemptNumber: attempt, status: { in: ["ISSUING", "UNKNOWN"] } },
        data: { status: "AUTHORIZED", finishedAt: new Date(), safeErrorCode: null },
      });
      if (attemptUpdate.count !== 1) throw new Error("payment_voucher_attempt_conflict");
    },
    persistFailure: async (input) => {
      const client = currentClient();
      const status = input.status === "FAILED" ? "FAILED" : "UNKNOWN";
      const safeErrorCode = SAFE_ERROR_CODES.has(String(input.safeErrorCode)) ? String(input.safeErrorCode) : "REMOTE_OUTCOME_UNKNOWN";
      const observedTotal = parseObservedTotal(input.observedTotalPesos);
      const observedCae = typeof input.observedCae === "string" && /^\d{14}$/.test(input.observedCae)
        ? input.observedCae : null;
      const observedInvoiceNumber = boundedPositiveInteger(input.observedInvoiceNumber);
      const observedPointOfSale = boundedPositiveInteger(input.observedPointOfSale, 99_999);
      const observedIssuedAt = safeObservedDate(input.observedIssuedAt);
      const update = await client.paymentVoucher.updateMany({
        where: { cashMovementId: String(input.paymentId), businessId: String(input.businessId), currentAttempt: Number(input.attempt), status: { in: ["PENDING", "ISSUING", "UNKNOWN"] } },
        data: {
          status,
          lastErrorCode: safeErrorCode,
          ...(observedTotal !== null ? { observedTotal: new Prisma.Decimal(observedTotal) } : {}),
          ...(observedCae ? { observedCae } : {}),
          ...(observedInvoiceNumber !== null ? { observedInvoiceNumber } : {}),
          ...(observedPointOfSale !== null ? { observedInvoicePointOfSale: observedPointOfSale } : {}),
          ...(observedIssuedAt ? { observedIssuedAt } : {}),
        },
      });
      if (update.count !== 1) return;
      await client.paymentVoucherAttempt.updateMany({
        where: { paymentVoucher: { cashMovementId: String(input.paymentId) }, attemptNumber: Number(input.attempt), status: { in: ["PREPARING", "ISSUING", "UNKNOWN"] } },
        data: { status, safeErrorCode, finishedAt: new Date() },
      });
    },
    getVoucher: async (paymentId, businessId) => {
      const findVoucher = () => db.paymentVoucher.findFirst({
          where: { cashMovementId: paymentId, businessId },
          include: {
            attempts: {
              orderBy: { attemptNumber: "desc" },
              take: 1,
              select: {
                billType: true,
                status: true,
                attemptNumber: true,
                amount: true,
                invoicePointOfSale: true,
                recipientSnapshot: true,
              },
            },
          },
      });
      const voucher = await findVoucher();
      if (!voucher) return null;
      const projectVoucher = (row: typeof voucher, statusOverride?: string): Record<string, unknown> => {
        if (!row) return { status: "MISSING" };
        const latestAttempt = row.attempts[0];
        const attemptMetadata = latestAttempt?.attemptNumber === row.currentAttempt
          ? {
              currentAttemptBillType: latestAttempt.billType,
              currentAttemptPointOfSale: latestAttempt.invoicePointOfSale,
              currentAttemptAmount: Number(latestAttempt.amount.toString()),
              currentRecipientSnapshot: latestAttempt.recipientSnapshot,
            }
          : {};
        const status = statusOverride ?? row.status;
        return {
          ...safePersistedVoucher({ ...row, status }),
          ...attemptMetadata,
          currentAttemptStatus: latestAttempt?.attemptNumber === row.currentAttempt
            ? statusOverride ?? latestAttempt.status
            : undefined,
          lastFailedAttemptBillType: status === "FAILED" && latestAttempt?.status === "FAILED"
            ? latestAttempt.billType
            : null,
        };
      };
      if ((voucher.status === "ISSUING" || voucher.status === "PENDING")
        && Date.now() - voucher.updatedAt.getTime() > 120_000) {
        const updated = await db.$transaction(async (tx) => {
          const changed = await tx.paymentVoucher.updateMany({
            where: { id: voucher.id, status: { in: ["ISSUING", "PENDING"] }, updatedAt: voucher.updatedAt },
            data: {
              status: voucher.status === "PENDING" ? "FAILED" : "UNKNOWN",
              lastErrorCode: voucher.status === "PENDING" ? "PREFLIGHT_REJECTED" : "REMOTE_OUTCOME_UNKNOWN",
            },
          });
          if (changed.count === 1) {
            await tx.paymentVoucherAttempt.updateMany({
              where: { paymentVoucherId: voucher.id, attemptNumber: voucher.currentAttempt, status: { in: ["PREPARING", "ISSUING"] } },
              data: {
                status: voucher.status === "PENDING" ? "FAILED" : "UNKNOWN",
                safeErrorCode: voucher.status === "PENDING" ? "PREFLIGHT_REJECTED" : "REMOTE_OUTCOME_UNKNOWN",
                finishedAt: new Date(),
              },
            });
          }
          return changed.count;
        });
        if (updated === 0) {
          const latestVoucher = await findVoucher();
          return latestVoucher ? projectVoucher(latestVoucher) : null;
        }
        return projectVoucher(voucher, voucher.status === "PENDING" ? "FAILED" : "UNKNOWN");
      }
      return projectVoucher(voucher);
    },
    transaction: async <T>(callback: () => Promise<T>): Promise<T> => db.$transaction((tx) =>
      transactionStorage.run(tx, callback),
    ),
  },
  afip: {
    prepare: async (invoice) => {
      const session = await auth();
      const user = session?.user;
      if (!user?.id || !user.businessId || !user.role) return { ok: false, definite: true };
      const result = await prepareAfipVoucherForActor(invoice, user as AuthenticatedUserContext);
      return "prepared" in result ? { ok: true, capability: result.prepared } : { ok: false, definite: true };
    },
    issue: async (capability, onDispatch) => {
      const result = await issuePreparedAfipVoucher(capability as PreparedAfipVoucher, onDispatch);
      if ("success" in result) {
        const snapshot = result.data.fiscalSnapshot;
        const total = snapshot?.total;
        const invoiceNumber = Number(result.data.nroComprobante);
        const pointOfSale = Number(result.data.ptoVenta);
        if (typeof total === "number" && Number.isFinite(total)
          && Number.isSafeInteger(invoiceNumber) && invoiceNumber > 0
          && Number.isSafeInteger(pointOfSale) && pointOfSale > 0
          && /^\d{14}$/.test(result.data.cae)) {
          return {
            kind: "authorized",
            total,
            cae: result.data.cae,
            invoiceNumber,
            pointOfSale,
            issuedAt: new Date(),
            caeVencimiento: result.data.vencimiento,
            qrData: result.data.qrData,
          };
        }
        return {
          kind: "unknown",
          ...(typeof total === "number" && Number.isFinite(total) ? { total } : {}),
          cae: result.data.cae,
          ...(Number.isSafeInteger(invoiceNumber) && invoiceNumber > 0 ? { invoiceNumber } : {}),
          ...(Number.isSafeInteger(pointOfSale) && pointOfSale > 0 ? { pointOfSale } : {}),
          issuedAt: new Date(),
          caeVencimiento: result.data.vencimiento,
          qrData: result.data.qrData,
        };
      }
      if (result.issuanceNotStarted || result.diagnostic?.authoritativeRejection === true) return { kind: "rejected" };
      return { kind: "unknown" };
    },
    // No authoritative per-payment lookup exists in the currently supported remote gateway.
    reconcile: async () => ({ kind: "unresolved" }),
  },
};

export const paymentVoucherService = createPaymentVoucherService(databaseDependencies);

export async function issuePaymentVoucherForSession(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    return await paymentVoucherService.issue(input);
  } catch (error: unknown) {
    return paymentVoucherIssueFailureOutcome(error);
  }
}

export async function getPaymentVoucherForSession(input: { cashMovementId: string }): Promise<PaymentVoucherStatusDTO> {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!session?.user?.id || !businessId || !input.cashMovementId) throw new Error("No autorizado");
  const payment = await databaseDependencies.repository.findPayment(input.cashMovementId, businessId);
  if (!payment || payment.businessId !== businessId || payment.order.businessId !== businessId) throw new Error("Pago no encontrado");
  const voucher = await databaseDependencies.repository.getVoucher(input.cashMovementId, businessId);
  if (!voucher) return { status: "MISSING" };

  const status = safeResultStatus(String(voucher.status ?? "UNKNOWN"));
  const previousFailedBillType = voucher.lastFailedAttemptBillType;
  if (status === "FAILED" && isSupportedBillType(previousFailedBillType)) {
    return { status, proposedBillType: previousFailedBillType };
  }
  return { status };
}

export async function printPaymentVoucherForSession(input: { cashMovementId: string }): Promise<Record<string, unknown>> {
  return paymentVoucherService.print(input);
}

export async function reconcilePaymentVoucherForSession(input: { cashMovementId: string }): Promise<Record<string, unknown>> {
  return paymentVoucherService.reconcile(input);
}
