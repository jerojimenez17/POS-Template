"use server";

import { auth } from "@/auth";
import { UserRole } from "@prisma/client";
import type { AuthenticatedUserContext } from "@/lib/auth-gates";
import {
  issuePreparedAfipVoucher,
  prepareAfipVoucherForActor,
  type AfipVoucherOperationResult,
  type PrepareAfipVoucherResult,
} from "@/lib/server/afip-voucher";
import { captureArcaCivilDate } from "@/services/afip/civil-date";
import { createAuthorizedFiscalSnapshotGrant } from "@/lib/server/fiscal-snapshot-grant";
import {
  getEffectiveAfipInvoiceTotal,
  normalizeAfipInvoiceDTO,
  projectAfipInvoiceInput,
  type AfipInvoiceDTO,
} from "@/utils/billing";

export interface AfipVoucherPublicData {
  cae: string;
  vencimiento: string;
  nroComprobante: number | string;
  ptoVenta?: number | string;
  qrAttestationToken?: string;
  fiscalSnapshotToken?: string;
}

export type CreateAfipVoucherResult =
  | { success: true; data: AfipVoucherPublicData }
  | { error: string | import("@/services/afip/point-sale-validation").AfipPointSaleError; diagnostic?: import("@/services/afip/voucher-response").AfipResponseDiagnostic; issuanceNotStarted?: true };

const CREDIT_NOTE_FIELDS = ["nroAsociado", "ptoVentaAsociado", "caeAsociado", "CbtesAsoc"] as const;
const TRUSTED_FISCAL_FIELDS = ["fiscalSnapshot", "fiscalBreakdown"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readOwnValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor)) throw new Error("Los datos de la factura no son válidos");
  return descriptor.value;
}

function isSerializableExtra(value: unknown, visited = new Set<object>(), depth = 0): boolean {
  if (value === null || value === undefined || typeof value === "string"
    || typeof value === "boolean" || typeof value === "number") return true;
  if (typeof value !== "object" || depth > 12) return false;
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) return value.every((item) => isSerializableExtra(item, visited, depth + 1));
  if (!isPlainObject(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)
      || !isSerializableExtra(descriptor.value, visited, depth + 1)) return false;
  }
  return true;
}

function validateUnknownProperties(value: Record<string, unknown>): void {
  const knownFields = new Set([
    "id", "seller", "typeDocument", "IVACondition", "twoMethods", "secondPaidMethod",
    "totalSecondMethod", "entrega", "pago", "billType", "paidMethod", "clientId", "client",
    "clientIvaCondition", "clientDocumentType", "clientDocumentNumber", "discount", "documentNumber", "total",
    "totalWithDiscount", "date", "ptoVenta", "products", ...CREDIT_NOTE_FIELDS, ...TRUSTED_FISCAL_FIELDS,
  ]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error("Los datos de la factura no son válidos");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new Error("Los datos de la factura no son válidos");
    if (!knownFields.has(key) && !isSerializableExtra(descriptor.value)) {
      throw new Error("La factura contiene datos que no se pueden procesar de forma segura");
    }
  }
}

function plainPreIssueError(message: string): CreateAfipVoucherResult {
  return { error: message, issuanceNotStarted: true };
}

/** Public Server Action. All caller identity is derived from the auth session. */
export const createAfipVoucherAction = async (
  billState: unknown,
): Promise<CreateAfipVoucherResult> => {
  let sessionUser: { id?: string | null; businessId?: string | null; role?: string | null } | undefined;
  try {
    const session = await auth();
    sessionUser = session?.user;
  } catch (error: unknown) {
    console.error("[createAfipVoucher] authentication failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return plainPreIssueError("No se pudo validar la sesión antes de iniciar la emisión");
  }
  if (!sessionUser?.id || !sessionUser.businessId || !sessionUser.role
    || (sessionUser.role !== UserRole.USER
      && sessionUser.role !== UserRole.ADMIN
      && sessionUser.role !== UserRole.SUPER_ADMIN)) {
    return { error: "No autorizado", issuanceNotStarted: true };
  }

  if (!isPlainObject(billState)) return plainPreIssueError("Los datos de la factura no son válidos");
  let safeInvoiceInput: Partial<AfipInvoiceDTO>;
  try {
    validateUnknownProperties(billState);
    const isCreditNoteRequest = (typeof readOwnValue(billState, "nroAsociado") === "number"
        && readOwnValue(billState, "nroAsociado") !== 0)
      || readOwnValue(billState, "ptoVentaAsociado") !== undefined
      || readOwnValue(billState, "caeAsociado") !== undefined
      || (Array.isArray(readOwnValue(billState, "CbtesAsoc"))
        && (readOwnValue(billState, "CbtesAsoc") as unknown[]).length > 0);
    if (isCreditNoteRequest || TRUSTED_FISCAL_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(billState, field))) {
      return plainPreIssueError("Las Notas de Crédito y los importes fiscales solo se procesan desde datos autorizados del servidor");
    }
    safeInvoiceInput = projectAfipInvoiceInput(billState);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Los datos de la factura no son válidos";
    return plainPreIssueError(message);
  }

  // Fix the ARCA civil date before preparation can await preflight lookups.
  // The projection above discards any caller-provided requestDate.
  safeInvoiceInput = { ...safeInvoiceInput, requestDate: captureArcaCivilDate() };

  let preparation: PrepareAfipVoucherResult;
  try {
    preparation = await prepareAfipVoucherForActor(
      safeInvoiceInput,
      sessionUser as AuthenticatedUserContext,
    );
  } catch (error: unknown) {
    console.error("[createAfipVoucher] preparation failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return plainPreIssueError("No se pudo preparar la factura antes de iniciar la emisión");
  }
  if (!("prepared" in preparation)) {
    if ("error" in preparation) return preparation;
    return plainPreIssueError("No se pudo preparar la factura antes de iniciar la emisión");
  }
  let invoice: AfipInvoiceDTO;
  try {
    invoice = normalizeAfipInvoiceDTO(safeInvoiceInput);
  } catch {
    return plainPreIssueError("Los datos de la factura no son válidos");
  }
  let issued: AfipVoucherOperationResult;
  try {
    issued = await issuePreparedAfipVoucher(preparation.prepared);
  } catch (error: unknown) {
    console.error("[createAfipVoucher] issuance setup failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return plainPreIssueError("No se pudo iniciar la emisión de la factura");
  }
  if (!("success" in issued)) return issued;

  let fiscalSnapshotToken: string | undefined;
  const snapshot = issued.data.fiscalSnapshot;
  if (snapshot) {
    const billType = invoice.billType;
    const invoiceNumber = Number(issued.data.nroComprobante);
    const pointOfSale = Number(issued.data.ptoVenta);
    const snapshotMatches = (billType === "Factura A" || billType === "Factura B" || billType === "Factura C")
      && snapshot.billType === billType
      && Number.isSafeInteger(invoiceNumber) && invoiceNumber > 0
      && Number.isSafeInteger(pointOfSale) && pointOfSale > 0
      && Math.abs(snapshot.total - getEffectiveAfipInvoiceTotal(invoice)) <= 0.0100001;
    if (snapshotMatches) {
      try {
        fiscalSnapshotToken = await createAuthorizedFiscalSnapshotGrant(
          sessionUser.businessId,
          issued.data.cae,
          snapshot,
          { billType, invoiceNumber, pointOfSale },
        );
      } catch (error: unknown) {
        console.error("Could not persist trusted authorized fiscal snapshot grant", {
          businessId: sessionUser.businessId,
          errorType: error instanceof Error ? error.name : typeof error,
        });
      }
    }
  }

  const publicData: AfipVoucherPublicData = {
    cae: issued.data.cae,
    vencimiento: issued.data.vencimiento,
    nroComprobante: issued.data.nroComprobante,
    ...(issued.data.ptoVenta === undefined ? {} : { ptoVenta: issued.data.ptoVenta }),
    ...(issued.data.qrAttestationToken ? { qrAttestationToken: issued.data.qrAttestationToken } : {}),
    ...(fiscalSnapshotToken ? { fiscalSnapshotToken } : {}),
  };
  return { success: true, data: publicData };
};
