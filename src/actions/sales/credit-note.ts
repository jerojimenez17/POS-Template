"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { preflightCreditNoteBillingConfiguration } from "@/lib/server/arca-billing";
import {
  issuePreparedAfipVoucher,
  prepareAfipVoucherForActor,
  type PreparedAfipVoucher,
} from "@/lib/server/afip-voucher";
import type { AuthenticatedUserContext } from "@/lib/auth-gates";
import type BillState from "@/models/BillState";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  buildCreditNoteCreateVoucherPayload,
  buildCreditNoteVoucherState,
  mapOriginalBillTypeToCreditNoteAfipType,
  normalizeAuthorizedFiscalSnapshot,
  normalizeSaleFiscalMetadata,
  parseCreditNoteResponse,
  type NormalizedSaleFiscalMetadata,
  type MissingFiscalField,
} from "@/services/afip/credit-note";
import type { AfipResponseDiagnostic } from "@/services/afip/voucher-response";

const missingFiscalDataSchema = z.object({
  billType: z.enum(["Factura A", "Factura B", "Factura C"]).optional(),
  invoicePointOfSale: z.number().int().positive().optional(),
  invoiceNumber: z.number().int().positive().optional(),
}).strict();
const inputSchema = z.object({ orderId: z.string().min(1), idempotencyKey: z.string().min(1).max(200), confirmed: z.literal(true), missingFiscalData: missingFiscalDataSchema.optional() }).strict();

export type CreateCreditNoteResult =
  | { success: true; data: { creditNoteCAE: string; creditNoteNumber: number; creditNotePointOfSale: number } }
  | { success: false; error: string; pending?: boolean; canFinalizeLocally?: boolean; code?: "UNAUTHORIZED" | "NOT_ELIGIBLE" | "PENDING" | "AFIP_ERROR" | "CONFLICT" | "INTERNAL_ERROR" };

interface SaleReturnRecord {
  id: string;
  kind?: string;
  status: "PENDING" | "AUTHORIZED" | "REJECTED";
  idempotencyKey: string;
  creditNoteCAE?: string | null;
  creditNoteNumber?: number | null;
  creditNotePointOfSale?: number | null;
}

interface SaleReturnDb {
  findFirst: (args: unknown) => Promise<SaleReturnRecord | null>;
  findUnique?: (args: unknown) => Promise<SaleReturnRecord | null>;
  create: (args: unknown) => Promise<SaleReturnRecord>;
  update: (args: unknown) => Promise<SaleReturnRecord>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
}

interface CreditNoteTransactionClient {
  saleReturn: SaleReturnDb;
  saleReturnItem: { createMany: (args: unknown) => Promise<unknown> };
  product: { update: (args: unknown) => Promise<unknown> };
  stockMovement: { createMany: (args: unknown) => Promise<unknown> };
  cashboxSession: { findFirst: (args: unknown) => Promise<{ id: string; cashboxId: string } | null> };
  cashBox: { update: (args: unknown) => Promise<unknown> };
  cashMovement: { create: (args: unknown) => Promise<unknown> };
}

interface CreditNoteReservationClient {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  business: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string; ptoVenta: unknown } | null>;
  };
  order: {
    findFirst: (args: unknown) => Promise<{ id: string; returns?: SaleReturnRecord[] } | null>;
  };
  saleReturn: SaleReturnDb;
}

interface FinalizationResult {
  claimed: boolean;
  record?: SaleReturnRecord;
}

interface CreditNoteVoucher {
  cae: string;
  number: number;
  pointOfSale: number;
}

const safeError = (): string => "No se pudo autorizar la Nota de Crédito";
const MISSING_FISCAL_SNAPSHOT_MESSAGE = "No se puede emitir la Nota de Crédito porque no está disponible el desglose fiscal original. Consulte/recupere el comprobante en ARCA antes de volver a intentar";
const CONFIGURATION_CHANGED_ERROR = "La configuración del punto de venta cambió antes de emitir; vuelva a validar la operación";
const AUTHORIZED_CAE_PATTERN = /^\d{14}$/;

function isPointOfSaleConfigurationChange(message: string): boolean {
  return /configuración.*punto de venta.*cambió/i.test(message);
}

function provesAuthoritativeNonIssuance(diagnostic: AfipResponseDiagnostic | undefined, message: string): boolean {
  if (diagnostic?.reason !== "afip-error") return false;
  if (typeof diagnostic.status === "number" && diagnostic.status >= 500) return false;
  if (diagnostic.authoritativeRejection !== undefined) return diagnostic.authoritativeRejection;

  // Compatibility for older action adapters that return the pre-classifier
  // diagnostic shape. Require all of the structured evidence; status alone
  // (including a 4xx) is never enough to release the reservation for retry.
  const hasClientErrorStatus = typeof diagnostic.status === "number"
    && diagnostic.status >= 400 && diagnostic.status < 500;
  const hasStructuredError = diagnostic.routes.includes("error") && diagnostic.fields.error === "object";
  const explicitlyNamesAfipRejection = /\b(?:AFIP|ARCA)\b.*(?:rechaz(?:ó|aron|ad[oa]s?)|rejected|deneg(?:ó|aron|ad[oa]s?))|(?:rechaz(?:ó|aron|ad[oa]s?)|rejected|deneg(?:ó|aron|ad[oa]s?)).*\b(?:AFIP|ARCA)\b/i.test(message);
  return hasClientErrorStatus && hasStructuredError && explicitlyNamesAfipRejection;
}

type CreditNoteLog = {
  event: "credit_note_request";
  phase: "validated" | "pending" | "arca_response" | "authorized" | "rejected" | "finalization_failed";
  orderId: string;
  businessId: string;
  saleReturnId?: string;
  status: "PENDING" | "AUTHORIZED" | "REJECTED" | "FAILED";
  originalBillType?: "Factura A" | "Factura B" | "Factura C";
  originalVoucherType?: 1 | 6 | 11;
  originalInvoiceNumber?: number;
  originalPointOfSale?: number;
  creditNoteBillType?: "Nota de Crédito A" | "Nota de Crédito B" | "Nota de Crédito C";
  creditNoteVoucherType?: 3 | 8 | 13;
  total: number;
  itemCount: number;
  associationPresent: boolean;
  hasOriginalCae: boolean;
  hasNewCae: boolean;
  hasNewNumber: boolean;
  hasNewPointOfSale: boolean;
  errorCode?: "NOT_ELIGIBLE" | "CONFLICT" | "AFIP_ERROR" | "INTERNAL_ERROR";
};

function logCreditNote(input: CreditNoteLog): void {
  console.info(input);
}

function readPersistedVoucher(row: SaleReturnRecord): CreditNoteVoucher | undefined {
  return typeof row.creditNoteCAE === "string" && AUTHORIZED_CAE_PATTERN.test(row.creditNoteCAE)
    && typeof row.creditNoteNumber === "number" && Number.isInteger(row.creditNoteNumber) && row.creditNoteNumber > 0
    && typeof row.creditNotePointOfSale === "number" && Number.isInteger(row.creditNotePointOfSale) && row.creditNotePointOfSale > 0
    ? { cae: row.creditNoteCAE, number: row.creditNoteNumber, pointOfSale: row.creditNotePointOfSale }
    : undefined;
}

const successData = (row: SaleReturnRecord): CreateCreditNoteResult | undefined => {
  const voucher = readPersistedVoucher(row);
  return voucher
    ? { success: true, data: { creditNoteCAE: voucher.cae, creditNoteNumber: voucher.number, creditNotePointOfSale: voucher.pointOfSale } }
    : undefined;
};

const pendingResult = (canFinalizeLocally: boolean): CreateCreditNoteResult => ({
  success: false,
  pending: true,
  canFinalizeLocally,
  error: canFinalizeLocally
    ? "La respuesta de ARCA está guardada; se requiere finalizar la operación localmente"
    : "El resultado de ARCA requiere conciliación. No vuelva a emitir la Nota de Crédito",
  code: "PENDING",
});

export async function createCreditNoteAction(input: unknown): Promise<CreateCreditNoteResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Datos de Nota de Crédito inválidos", code: "NOT_ELIGIBLE" };

  const session = await Promise.resolve().then(() => auth()).catch(() => null);
  if (session?.user?.role !== "ADMIN") {
    return { success: false, error: "No hay una sesión autorizada para emitir Notas de Crédito", code: "UNAUTHORIZED" };
  }
  const businessId = session.user.businessId;
  const userId = session.user.id;
  if (!businessId || !userId) return { success: false, error: "No hay una sesión autorizada", code: "UNAUTHORIZED" };
  const actorBusinessId: string = businessId;
  const authenticatedUser = session.user;

  try {
    const saleReturnDb = db.saleReturn as unknown as SaleReturnDb;
    const order = await db.order.findFirst({
      where: { id: parsed.data.orderId, businessId },
      include: { items: true, returns: true },
    });
    if (!order || order.paidStatus !== "pago") {
      return { success: false, error: "La venta no existe o no está pagada", code: "NOT_ELIGIBLE" };
    }
    const saleOrder = order;

    const returnRows = ((order.returns ?? (order as unknown as { saleReturns?: unknown[] }).saleReturns ?? []) as unknown) as SaleReturnRecord[];
    if (returnRows.some((item) => item.kind === "MANUAL_RETURN"
      && (item.status === "PENDING" || item.status === "AUTHORIZED"))) {
      return { success: false, error: "La venta ya tiene una devolución manual y no admite una reversión completa", code: "NOT_ELIGIBLE" };
    }

    const persistedInput: Record<string, unknown> = {
      ...(order as unknown as Record<string, unknown>),
      ...(order.billType == null ? { billType: undefined } : {}),
      ...(order.afipVoucherType == null ? { afipVoucherType: undefined } : {}),
      ...(order.invoiceNumber == null ? { invoiceNumber: undefined } : {}),
      ...(order.invoicePointOfSale == null ? { invoicePointOfSale: undefined } : {}),
      cae: order.CAE,
    };
    const fiscalResult = normalizeSaleFiscalMetadata(persistedInput);
    if (order.fiscalSnapshot !== null && fiscalResult.status !== "VALID") {
      return { success: false, error: "El desglose fiscal autorizado no puede asociarse inequívocamente al comprobante original", code: "NOT_ELIGIBLE" };
    }
    let resolvedInput: Record<string, unknown> = persistedInput;
    if (fiscalResult.status === "INVALID_OR_INCOMPLETE" && fiscalResult.canCompleteFromUser && fiscalResult.missingFields) {
      const proposal = parsed.data.missingFiscalData;
      const proposalKeys = proposal ? Object.keys(proposal) as MissingFiscalField[] : [];
      const allowed = new Set(fiscalResult.missingFields);
      if (proposalKeys.some((key) => !allowed.has(key)) || fiscalResult.missingFields.some((key) => proposal?.[key] === undefined)) {
        return { success: false, error: "Los datos fiscales de la venta cambiaron o son inconsistentes", code: "CONFLICT" };
      }
      resolvedInput = { ...persistedInput, ...proposal };
    } else if (parsed.data.missingFiscalData) {
      return { success: false, error: "Los datos fiscales de la venta cambiaron o son inconsistentes", code: "CONFLICT" };
    }
    const resolvedFiscalResult = normalizeSaleFiscalMetadata(resolvedInput);
    if (resolvedFiscalResult.status !== "VALID") {
      return { success: false, error: "La venta no tiene datos fiscales inequívocos", code: "NOT_ELIGIBLE" };
    }
    const normalized: NormalizedSaleFiscalMetadata = resolvedFiscalResult.metadata;
    const creditNoteAfipType = mapOriginalBillTypeToCreditNoteAfipType(normalized.billType);
    const fiscalSnapshot = normalizeAuthorizedFiscalSnapshot(order.fiscalSnapshot, {
      billType: normalized.billType,
      afipVoucherType: normalized.originalAfipVoucherType,
      total: order.total,
    });
    if (!fiscalSnapshot) {
      return { success: false, error: MISSING_FISCAL_SNAPSHOT_MESSAGE, code: "NOT_ELIGIBLE" };
    }

    if (!order.items?.length || !Number.isFinite(order.total) || order.total <= 0
      || order.items.some((item) => typeof item.productId !== "string" || !item.productId.trim()
        || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      return { success: false, error: "La venta no tiene un detalle de productos completo", code: "NOT_ELIGIBLE" };
    }
    let selectedCashbox: { id: string; cashboxId: string } | undefined;
    const selectOpenCashbox = async (): Promise<boolean> => {
      const active = await db.cashboxSession.findFirst({ where: { businessId, userId, status: "OPEN" } });
      if (!active) return false;
      selectedCashbox = active;
      return true;
    };

    logCreditNote({
      event: "credit_note_request", phase: "validated", orderId: order.id, businessId, status: "PENDING",
      originalBillType: normalized.billType, originalVoucherType: normalized.originalAfipVoucherType,
      originalInvoiceNumber: normalized.invoiceNumber, originalPointOfSale: normalized.invoicePointOfSale,
      total: order.total, itemCount: order.items.length, associationPresent: true, hasOriginalCae: true,
      hasNewCae: false, hasNewNumber: false, hasNewPointOfSale: false,
    });

    const isCreditNoteReturn = (item: SaleReturnRecord): boolean => item.kind === "CREDIT_NOTE"
      || typeof item.creditNoteCAE === "string"
      || typeof item.creditNoteNumber === "number";
    const existingAuthorized = returnRows.find((item) => isCreditNoteReturn(item) && item.status === "AUTHORIZED");
    if (existingAuthorized) {
      return existingAuthorized.idempotencyKey === parsed.data.idempotencyKey
        ? successData(existingAuthorized) ?? { success: false, error: "La Nota de Crédito autorizada no tiene datos fiscales válidos", code: "INTERNAL_ERROR" }
        : { success: false, error: "La venta ya tiene una Nota de Crédito autorizada", code: "CONFLICT" };
    }

    let pending = returnRows.find(isCreditNoteReturn)
      ?? await saleReturnDb.findFirst({ where: { orderId: order.id, businessId, kind: "CREDIT_NOTE" } })
      ?? undefined;
    if (pending?.status === "AUTHORIZED") {
      return pending.idempotencyKey === parsed.data.idempotencyKey
        ? successData(pending) ?? { success: false, error: "La Nota de Crédito autorizada no tiene datos fiscales válidos", code: "INTERNAL_ERROR" }
        : { success: false, error: "La venta ya tiene una Nota de Crédito autorizada", code: "CONFLICT" };
    }
    if (pending?.status === "PENDING") {
      const voucher = readPersistedVoucher(pending);
      if (!voucher) return pendingResult(false);
      if (!(await selectOpenCashbox())) {
        return { success: false, error: "Debe abrir una caja para finalizar la Nota de Crédito", code: "NOT_ELIGIBLE" };
      }
      return finalizeLocally(pending, voucher);
    }
    if (pending?.status === "REJECTED" && pending.idempotencyKey !== parsed.data.idempotencyKey) {
      return { success: false, error: "La Nota de Crédito no puede reintentarse con otra clave", code: "CONFLICT" };
    }

    // Establish tenant billing eligibility and every local/deterministic
    // issuance prerequisite before creating or reclaiming a PENDING row.
    // This helper only reads persisted configuration and validates it locally;
    // it does not call the remote last-voucher lookup or issue a voucher.
    const billingPreflight = await preflightCreditNoteBillingConfiguration({
      businessId,
      tipoFactura: creditNoteAfipType,
    });
    if (!billingPreflight.success) {
      return { success: false, error: billingPreflight.error, code: "NOT_ELIGIBLE" };
    }
    const emissionPointOfSale = billingPreflight.emissionPointOfSale;

    if (!(await selectOpenCashbox())) {
      return { success: false, error: "Debe abrir una caja para emitir la Nota de Crédito", code: "NOT_ELIGIBLE" };
    }

    const products = order.items.map((item) => ({
      id: item.productId as string,
      code: item.code ?? "",
      description: item.description ?? "",
      price: item.costPrice ?? item.price,
      salePrice: item.price,
      amount: item.quantity,
    }));
    const billState = buildCreditNoteVoucherState({
      billType: normalized.billType,
      emissionPointOfSale,
      nroAsociado: normalized.invoiceNumber,
      ptoVentaAsociado: normalized.invoicePointOfSale,
      caeAsociado: normalized.originalCAE,
      products,
      total: order.total,
      totalWithDiscount: fiscalSnapshot.total,
      discount: 0,
      fiscalSnapshot,
      IVACondition: order.clientIvaCondition ?? "Consumidor Final",
      clientDocumentType: order.clientDocumentType ?? undefined,
      clientDocumentNumber: order.clientDocumentNumber ?? undefined,
    });
    const createVoucherPayload = buildCreditNoteCreateVoucherPayload({
      arca: { tipoFactura: creditNoteAfipType, puntoVenta: emissionPointOfSale },
      billState,
    });
    const creditNoteBillState = {
      ...(createVoucherPayload.billState as Record<string, unknown>),
      date: new Date().toISOString(),
    };

    // The read-only ARCA sequence lookup must succeed before taking the order
    // lock or creating/claiming a SaleReturn. The opaque preparation is bound
    // to this authenticated actor and is the only input accepted for issuance.
    const preparedResult = await prepareAfipVoucherForActor(
      creditNoteBillState as unknown as BillState,
      authenticatedUser as AuthenticatedUserContext,
    );
    if (!("prepared" in preparedResult)) {
      if (!("error" in preparedResult)) {
        return { success: false, error: safeError(), code: "INTERNAL_ERROR" };
      }
      const afipMessage = typeof preparedResult.error === "string"
        ? preparedResult.error
        : preparedResult.error.message;
      return { success: false, error: afipMessage, code: "AFIP_ERROR" };
    }
    const preparedVoucher: PreparedAfipVoucher = preparedResult.prepared;

    let ownsAfipCall = false;
    if (!pending || pending.status === "REJECTED") {
      // Reserve/claim only while holding the same tenant-scoped Order lock as
      // manual returns. Commit and release it before any external AFIP call.
      const reservation = await db.$transaction(async (tx) => {
        const transaction = tx as unknown as CreditNoteReservationClient;
        await transaction.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Order" WHERE "id" = ${order.id} AND "businessId" = ${businessId} FOR UPDATE`;

        const freshOrder = await transaction.order.findFirst({
          where: { id: order.id, businessId },
          include: { returns: true },
        });
        if (!freshOrder) return { kind: "conflict" as const, message: "La venta no existe o no está disponible" };

        // The preflight and the read-only voucher-sequence lookup run before
        // this transaction. Recheck the persisted tenant configuration while
        // holding the reservation lock so no SaleReturn can be reserved for a
        // POS that is no longer the tenant's selected emission point.
        const freshBusiness = await transaction.business.findUnique({ where: { id: businessId } });
        const currentEmissionPointOfSale = Array.isArray(freshBusiness?.ptoVenta)
          ? freshBusiness.ptoVenta[0]
          : undefined;
        if (!freshBusiness || freshBusiness.id !== businessId
          || typeof currentEmissionPointOfSale !== "number"
          || !Number.isSafeInteger(currentEmissionPointOfSale)
          || currentEmissionPointOfSale <= 0
          || currentEmissionPointOfSale !== emissionPointOfSale) {
          return { kind: "configuration_changed" as const };
        }

        const freshReturns = freshOrder.returns ?? [];
        if (freshReturns.some((item) => item.kind === "MANUAL_RETURN"
          && (item.status === "PENDING" || item.status === "AUTHORIZED"))) {
          return { kind: "conflict" as const, message: "La venta ya tiene una devolución manual y no admite una reversión completa" };
        }

        const freshCreditNote = freshReturns.find(isCreditNoteReturn);
        if (freshCreditNote && freshCreditNote.status !== "REJECTED") {
          return { kind: "existing" as const, record: freshCreditNote };
        }
        if (freshCreditNote && freshCreditNote.idempotencyKey !== parsed.data.idempotencyKey) {
          return { kind: "conflict" as const, message: "La Nota de Crédito no puede reintentarse con otra clave" };
        }

        if (freshCreditNote) {
          const claim = await transaction.saleReturn.updateMany({
            where: { id: freshCreditNote.id, status: "REJECTED", idempotencyKey: parsed.data.idempotencyKey },
            data: { status: "PENDING", reason: "Reintentando autorización" },
          });
          if (claim.count !== 1) return { kind: "conflict" as const, message: "La Nota de Crédito está siendo procesada" };
          return { kind: "reserved" as const, record: { ...freshCreditNote, status: "PENDING" as const } };
        }

        const created = await transaction.saleReturn.create({
          data: {
            orderId: order.id,
            businessId,
            kind: "CREDIT_NOTE",
            status: "PENDING",
            idempotencyKey: parsed.data.idempotencyKey,
            requestedById: userId,
            total: order.total,
            reason: "Reversión fiscal completa",
            refundMethod: "Efectivo",
            originalCAE: normalized.originalCAE,
            originalVoucherType: normalized.originalAfipVoucherType,
            originalNumber: normalized.invoiceNumber,
            originalPointOfSale: normalized.invoicePointOfSale,
            creditNoteBillType: `Nota de Crédito ${normalized.billType.replace("Factura ", "")}`,
            creditNoteAfipType,
          },
        });
        return { kind: "reserved" as const, record: created };
      });

      if (reservation.kind === "conflict") {
        return { success: false, error: reservation.message, code: "CONFLICT" };
      }
      if (reservation.kind === "configuration_changed") {
        return { success: false, error: CONFIGURATION_CHANGED_ERROR, code: "NOT_ELIGIBLE" };
      }
      pending = reservation.record;
      if (reservation.kind === "existing") {
        if (pending.status === "AUTHORIZED") {
          return pending.idempotencyKey === parsed.data.idempotencyKey
            ? successData(pending) ?? { success: false, error: "La Nota de Crédito autorizada no tiene datos fiscales válidos", code: "INTERNAL_ERROR" }
            : { success: false, error: "La venta ya tiene una Nota de Crédito autorizada", code: "CONFLICT" };
        }
        const savedVoucher = readPersistedVoucher(pending);
        return savedVoucher ? finalizeLocally(pending, savedVoucher) : pendingResult(false);
      }
      ownsAfipCall = true;
    }

    if (!pending || !ownsAfipCall) return { success: false, error: "No se pudo reservar la Nota de Crédito", code: "CONFLICT" };

    const requireReconciliation = async (reason: string): Promise<CreateCreditNoteResult> => {
      try {
        await saleReturnDb.updateMany({
          where: { id: pending!.id, status: "PENDING" },
          data: { reason },
        });
      } catch {
        // Keep the reservation blocked even if the explanatory reason cannot be saved.
      }
      return pendingResult(false);
    };

    let responseData: CreditNoteVoucher;
    try {
      const result = await issuePreparedAfipVoucher(preparedVoucher);
      if (!("success" in result)) {
        const afipMessage = typeof result.error === "string" ? result.error : result.error.message;
        if (result.issuanceNotStarted === true) {
          const safeFailureMessage = isPointOfSaleConfigurationChange(afipMessage)
            ? CONFIGURATION_CHANGED_ERROR
            : safeError();
          await saleReturnDb.updateMany({
            where: { id: pending.id, status: "PENDING" },
            data: { status: "REJECTED", reason: safeFailureMessage },
          });
          return { success: false, error: safeFailureMessage, code: "AFIP_ERROR" };
        }
        if (provesAuthoritativeNonIssuance(result.diagnostic, afipMessage)) {
          await saleReturnDb.updateMany({
            where: { id: pending.id, status: "PENDING" },
            data: { status: "REJECTED", reason: safeError() },
          });
          return { success: false, error: safeError(), code: "AFIP_ERROR" };
        }
        return requireReconciliation("Resultado de ARCA incierto; requiere conciliación antes de cualquier reintento");
      }
      const parsedResponse = parseCreditNoteResponse(result.data, {
        originalCae: normalized.originalCAE,
        originalNumber: normalized.invoiceNumber,
        originalPointOfSale: normalized.invoicePointOfSale,
      });
      if (typeof parsedResponse.cae !== "string" || !AUTHORIZED_CAE_PATTERN.test(parsedResponse.cae)
        || typeof parsedResponse.number !== "number" || !Number.isInteger(parsedResponse.number) || parsedResponse.number <= 0
        || typeof parsedResponse.pointOfSale !== "number" || !Number.isInteger(parsedResponse.pointOfSale) || parsedResponse.pointOfSale <= 0) {
        return requireReconciliation("Respuesta de ARCA incompleta; requiere conciliación antes de cualquier reintento");
      }
      responseData = { cae: parsedResponse.cae, number: parsedResponse.number, pointOfSale: parsedResponse.pointOfSale };
    } catch {
      // A thrown request/transport/process failure cannot prove non-issuance.
      return requireReconciliation("Error de comunicación con ARCA; el resultado requiere conciliación");
    }

    let saved: SaleReturnRecord;
    try {
      saved = await saleReturnDb.update({
        where: { id: pending.id },
        data: {
          status: "PENDING",
          reason: "Respuesta de ARCA guardada; pendiente de finalización local",
          creditNoteCAE: responseData.cae,
          creditNoteNumber: responseData.number,
          creditNotePointOfSale: responseData.pointOfSale,
        },
      });
      const persistedVoucher = readPersistedVoucher(saved);
      if (!persistedVoucher || saved.status !== "PENDING") {
        return requireReconciliation("Respuesta guardada sin datos completos; requiere conciliación antes de cualquier reintento");
      }
      responseData = persistedVoucher;
    } catch {
      logCreditNote({
        event: "credit_note_request", phase: "finalization_failed", orderId: order.id, businessId,
        saleReturnId: pending.id, status: "PENDING", total: order.total, itemCount: order.items.length,
        associationPresent: true, hasOriginalCae: true, hasNewCae: true, hasNewNumber: true, hasNewPointOfSale: true,
      });
      return requireReconciliation("Respuesta de ARCA recibida pero no persistida; requiere conciliación en ARCA");
    }

    return finalizeLocally(saved, responseData);

    async function finalizeLocally(returnRow: SaleReturnRecord, voucher: CreditNoteVoucher): Promise<CreateCreditNoteResult> {
      try {
        const cashboxSession = selectedCashbox;
        if (!cashboxSession) return { success: false, error: "Debe abrir una caja para finalizar la Nota de Crédito", code: "NOT_ELIGIBLE" };
        const finalization = await db.$transaction(async (tx) => {
          const transaction = tx as unknown as CreditNoteTransactionClient;
          // Recheck the actor's session inside the transaction before claiming
          // the pending row or changing any local inventory/cash state.
          const active = await transaction.cashboxSession.findFirst({ where: { id: cashboxSession.id, businessId, userId, status: "OPEN" } });
          if (!active) throw new Error("Open cashbox session is required");
          const claim = await transaction.saleReturn.updateMany({
            where: { id: returnRow.id, status: "PENDING" },
            data: { status: "AUTHORIZED", authorizedAt: new Date() },
          });
          if (claim.count !== 1) {
            const current = await transaction.saleReturn.findUnique?.({ where: { id: returnRow.id } });
            return { claimed: false, record: current ?? undefined } satisfies FinalizationResult;
          }
          await transaction.saleReturnItem.createMany({
            data: saleOrder.items.map((item) => ({
              returnId: returnRow.id,
              orderItemId: item.id,
              productId: item.productId,
              quantity: item.quantity,
              refundAmount: item.subTotal ?? item.price * item.quantity,
            })),
          });
          for (const item of saleOrder.items) {
            await transaction.product.update({ where: { id: item.productId as string }, data: { amount: { increment: item.quantity } } });
          }
          await transaction.stockMovement.createMany({
            data: saleOrder.items.map((item) => ({
              type: "RETURN",
              quantity: item.quantity,
              productId: item.productId as string,
              orderId: saleOrder.id,
              businessId,
              reason: `Nota de Crédito #${returnRow.id}`,
            })),
          });
          await transaction.cashBox.update({ where: { id: active.cashboxId }, data: { total: { decrement: saleOrder.total } } });
          await transaction.cashMovement.create({
            data: {
              total: -saleOrder.total,
              paidMethod: "Efectivo",
              businessId,
              orderId: saleOrder.id,
              cashboxSessionId: active.id,
              seller: authenticatedUser.email ?? null,
              date: new Date(),
            },
          });
          const finalRecord = await transaction.saleReturn.findUnique?.({ where: { id: returnRow.id } });
          if (transaction.saleReturn.findUnique && !finalRecord) throw new Error("Could not read finalized credit note");
          return {
            claimed: true,
            record: finalRecord ?? {
              ...returnRow,
              status: "AUTHORIZED",
              creditNoteCAE: voucher.cae,
              creditNoteNumber: voucher.number,
              creditNotePointOfSale: voucher.pointOfSale,
            },
          } satisfies FinalizationResult;
        });

        if (!finalization.claimed) {
          const alreadyFinalized = finalization.record?.status === "AUTHORIZED" ? successData(finalization.record) : undefined;
          return alreadyFinalized ?? { success: false, error: "La Nota de Crédito fue procesada por otra solicitud", code: "CONFLICT" };
        }
        const committed = finalization.record ? successData(finalization.record) : undefined;
        if (!committed) return { success: false, error: "La Nota de Crédito autorizada no tiene datos fiscales válidos", code: "INTERNAL_ERROR" };
        try { revalidatePath(`/sales/${saleOrder.id}`); } catch { /* committed state is authoritative */ }
        logCreditNote({
          event: "credit_note_request", phase: "authorized", orderId: saleOrder.id, businessId: actorBusinessId,
          saleReturnId: returnRow.id, status: "AUTHORIZED", originalBillType: normalized.billType,
          originalVoucherType: normalized.originalAfipVoucherType, originalInvoiceNumber: normalized.invoiceNumber,
          originalPointOfSale: normalized.invoicePointOfSale,
          creditNoteBillType: `Nota de Crédito ${normalized.billType.replace("Factura ", "")}` as "Nota de Crédito A" | "Nota de Crédito B" | "Nota de Crédito C",
          creditNoteVoucherType: creditNoteAfipType, total: saleOrder.total, itemCount: saleOrder.items.length,
          associationPresent: true, hasOriginalCae: true, hasNewCae: true, hasNewNumber: true, hasNewPointOfSale: true,
        });
        return committed;
      } catch {
        logCreditNote({
          event: "credit_note_request", phase: "finalization_failed", orderId: saleOrder.id, businessId: actorBusinessId,
          saleReturnId: returnRow.id, status: "PENDING", total: saleOrder.total, itemCount: saleOrder.items.length,
          associationPresent: true, hasOriginalCae: true, hasNewCae: true, hasNewNumber: true, hasNewPointOfSale: true,
        });
        return pendingResult(true);
      }
    }
  } catch {
    return { success: false, error: safeError(), code: "INTERNAL_ERROR" };
  }
}
