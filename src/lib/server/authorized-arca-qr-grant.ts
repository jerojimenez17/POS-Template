import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildArcaQrUrl, normalizeArcaIssuerCuit, type ArcaQrPayloadV1 } from "@/services/afip/qr-payload";
import { logQrTelemetry, type QrTelemetryReason } from "@/lib/server/qr-telemetry";

const GRANT_TTL_MS = 30 * 60 * 1000;

export interface AuthorizedArcaQrClaimsV1 {
  businessId: string;
  cae: string;
  billType: "Factura A" | "Factura B" | "Factura C";
  afipVoucherType: 1 | 6 | 11;
  invoiceNumber: number;
  pointOfSale: number;
  fiscalAmount: string;
  issuerCuit: string;
  requestDate: string;
  recipientIvaCondition: string;
  recipientDocumentType: "CUIT" | "DNI" | null;
  recipientDocumentNumber: string | null;
  payload: ArcaQrPayloadV1 | null;
  rawQrData: string | null;
}

export interface AuthorizedArcaQrBinding {
  businessId: string;
  cae: string;
  billType?: string;
  afipVoucherType?: number;
  invoiceNumber?: number;
  pointOfSale?: number;
  fiscalAmount?: string;
  issuerCuit?: string;
  recipientIvaCondition?: string;
  recipientDocumentType?: string | null;
  recipientDocumentNumber?: string | null;
}

export interface ServerPrintQrDto {
  qrValue: string | null;
  qrKind: "verified-url" | "verified-raw" | "legacy-raw" | "none";
}

interface BusinessCuitReader {
  business?: {
    findUnique?: (args: { where: { id: string }; select: { cuit: true } }) =>
      Promise<{ cuit: string | null } | null>;
  };
}

/** undefined means this lightweight adapter exposes no Business delegate; null means lookup failed. */
export async function getTenantIssuerCuit(client: unknown, businessId: string): Promise<string | null | undefined> {
  const delegate = (client as BusinessCuitReader | null)?.business;
  if (typeof delegate?.findUnique !== "function") return undefined;
  try {
    const business = await delegate.findUnique({ where: { id: businessId }, select: { cuit: true } });
    return business ? normalizeArcaIssuerCuit(business.cuit) : null;
  } catch {
    return null;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dateOnly(value: Date | string): string | null {
  if (typeof value === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? value
      : null;
  }
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function decimalString(value: unknown): string | null {
  if (Prisma.Decimal.isDecimal(value)) {
    try {
      if (!value.isFinite() || !value.gt(0) || value.decimalPlaces() > 2 || value.precision() > 12) return null;
      const canonical = value.toFixed(2);
      return /^\d{1,10}\.\d{2}$/.test(canonical) ? canonical : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value)) {
    const [whole, fraction = ""] = value.split(".");
    const canonical = `${whole}.${fraction.padEnd(2, "0")}`;
    return /^\d{1,10}\.\d{2}$/.test(canonical) && new Prisma.Decimal(canonical).gt(0) ? canonical : null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const decimal = new Prisma.Decimal(value.toString());
    return decimal.decimalPlaces() <= 2 ? decimalString(decimal) : null;
  }
  return null;
}

function isValidClaims(claims: AuthorizedArcaQrClaimsV1): boolean {
  const baseValid = Boolean(
    claims.businessId
    && /^\d{14}$/.test(claims.cae)
    && (claims.billType === "Factura A" || claims.billType === "Factura B" || claims.billType === "Factura C")
    && ((claims.billType === "Factura A" && claims.afipVoucherType === 1)
      || (claims.billType === "Factura B" && claims.afipVoucherType === 6)
      || (claims.billType === "Factura C" && claims.afipVoucherType === 11))
    && Number.isSafeInteger(claims.invoiceNumber) && claims.invoiceNumber > 0
    && Number.isSafeInteger(claims.pointOfSale) && claims.pointOfSale > 0
    && decimalString(claims.fiscalAmount) !== null
    && normalizeArcaIssuerCuit(claims.issuerCuit) !== null
    && dateOnly(claims.requestDate) !== null
    && claims.recipientIvaCondition.trim().length > 0
    && (claims.recipientDocumentType === null || claims.recipientDocumentType === "CUIT" || claims.recipientDocumentType === "DNI")
    && (claims.recipientDocumentNumber === null || /^\d+$/.test(claims.recipientDocumentNumber))
    && (claims.rawQrData === null || claims.rawQrData.trim().length > 0)
    && (claims.payload !== null || claims.rawQrData !== null),
  );
  if (!baseValid) return false;
  if (claims.payload === null) return true;

  const canonicalAmount = decimalString(claims.fiscalAmount);
  const expectedRecipientType = claims.recipientDocumentType === "CUIT"
    ? 80
    : claims.recipientDocumentType === "DNI"
      ? 96
      : claims.recipientDocumentNumber === null
        && claims.recipientIvaCondition.trim().toLocaleLowerCase().replace(/_/g, " ") === "consumidor final"
        ? 99
        : null;
  const expectedRecipientNumber = expectedRecipientType === 99
    ? 0
    : claims.recipientDocumentNumber !== null && /^\d+$/.test(claims.recipientDocumentNumber)
      ? Number(claims.recipientDocumentNumber)
      : null;
  const payload = claims.payload;
  const issuerCuit = normalizeArcaIssuerCuit(claims.issuerCuit);
  return buildArcaQrUrl(payload) !== null
    && payload.fecha === claims.requestDate
    && issuerCuit !== null && payload.cuit === Number(issuerCuit)
    && payload.ptoVta === claims.pointOfSale
    && payload.tipoCmp === claims.afipVoucherType
    && payload.nroCmp === claims.invoiceNumber
    && canonicalAmount !== null && decimalString(payload.importe) === canonicalAmount
    && payload.tipoDocRec === expectedRecipientType
    && payload.nroDocRec === expectedRecipientNumber
    && payload.codAut === Number(claims.cae);
}

function areClaimsValid(claims: AuthorizedArcaQrClaimsV1): boolean {
  try {
    return isValidClaims(claims);
  } catch {
    return false;
  }
}

export async function createAuthorizedArcaQrGrant(
  claims: AuthorizedArcaQrClaimsV1,
): Promise<{ id: string; token: string } | null> {
  if (!isValidClaims(claims)) {
    logQrTelemetry({ stage: "grant-create", outcome: "rejected", reason: "claims-invalid" });
    return null;
  }
  const token = randomBytes(32).toString("hex");
  try {
    const grant = await db.authorizedArcaQrGrant.create({
      data: {
        tokenHash: hashToken(token),
        businessId: claims.businessId,
        cae: claims.cae,
        billType: claims.billType,
        afipVoucherType: claims.afipVoucherType,
        invoiceNumber: claims.invoiceNumber,
        pointOfSale: claims.pointOfSale,
        fiscalAmount: decimalString(claims.fiscalAmount) as string,
        issuerCuit: normalizeArcaIssuerCuit(claims.issuerCuit) as string,
        requestDate: new Date(`${claims.requestDate}T00:00:00.000Z`),
        recipientIvaCondition: claims.recipientIvaCondition,
        recipientDocumentType: claims.recipientDocumentType,
        recipientDocumentNumber: claims.recipientDocumentNumber,
        ...(claims.payload === null ? {} : {
          payload: JSON.parse(JSON.stringify(claims.payload)) as Prisma.InputJsonValue,
        }),
        rawQrData: claims.rawQrData,
        expiresAt: new Date(Date.now() + GRANT_TTL_MS),
      },
      select: { id: true },
    });
    logQrTelemetry({ stage: "grant-create", outcome: "created" });
    return { id: grant.id, token };
  } catch {
    // CAE authorization is authoritative and must not be retried because QR proof storage failed.
    logQrTelemetry({ stage: "grant-create", outcome: "rejected", reason: "grant-create-failed" });
    return null;
  }
}

/** Resolve and atomically consume a one-use grant inside the caller's transaction. */
export async function consumeAuthorizedArcaQrGrant(
  tx: Prisma.TransactionClient,
  token: string,
  expectedBinding: AuthorizedArcaQrBinding,
): Promise<{ id: string; claims: AuthorizedArcaQrClaimsV1 } | null> {
  if (typeof token !== "string" || token.length === 0 || token.length > 512) {
    logQrTelemetry({
      stage: "save-consume-ref",
      outcome: "rejected",
      reason: typeof token === "string" && token.length === 0 ? "token-absent" : "binding-mismatch",
    });
    return null;
  }
  const whereBinding = {
    businessId: expectedBinding.businessId,
    cae: expectedBinding.cae,
    ...(expectedBinding.billType === undefined ? {} : { billType: expectedBinding.billType }),
    ...(expectedBinding.afipVoucherType === undefined ? {} : { afipVoucherType: expectedBinding.afipVoucherType }),
    ...(expectedBinding.invoiceNumber === undefined ? {} : { invoiceNumber: expectedBinding.invoiceNumber }),
    ...(expectedBinding.pointOfSale === undefined ? {} : { pointOfSale: expectedBinding.pointOfSale }),
    ...(expectedBinding.fiscalAmount === undefined ? {} : { fiscalAmount: expectedBinding.fiscalAmount }),
    ...(expectedBinding.issuerCuit === undefined ? {} : { issuerCuit: expectedBinding.issuerCuit }),
    ...(expectedBinding.recipientIvaCondition === undefined
      ? {} : { recipientIvaCondition: expectedBinding.recipientIvaCondition }),
    ...(expectedBinding.recipientDocumentType === undefined
      ? {} : { recipientDocumentType: expectedBinding.recipientDocumentType }),
    ...(expectedBinding.recipientDocumentNumber === undefined
      ? {} : { recipientDocumentNumber: expectedBinding.recipientDocumentNumber }),
  };
  const grant = await tx.authorizedArcaQrGrant.findFirst({
    where: {
      tokenHash: hashToken(token),
      ...whereBinding,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!grant) {
    logQrTelemetry({ stage: "save-consume-ref", outcome: "rejected", reason: "binding-mismatch" });
    return null;
  }

  const normalizedDate = dateOnly(grant.requestDate);
  const normalizedAmount = decimalString(grant.fiscalAmount);
  if (!normalizedDate || !normalizedAmount) {
    logQrTelemetry({ stage: "save-consume-ref", outcome: "rejected", reason: "payload-invalid" });
    return null;
  }
  const claims: AuthorizedArcaQrClaimsV1 = {
    businessId: grant.businessId,
    cae: grant.cae,
    billType: grant.billType as AuthorizedArcaQrClaimsV1["billType"],
    afipVoucherType: grant.afipVoucherType as AuthorizedArcaQrClaimsV1["afipVoucherType"],
    invoiceNumber: grant.invoiceNumber,
    pointOfSale: grant.pointOfSale,
    fiscalAmount: normalizedAmount,
    issuerCuit: grant.issuerCuit,
    requestDate: normalizedDate,
    recipientIvaCondition: grant.recipientIvaCondition,
    recipientDocumentType: grant.recipientDocumentType as AuthorizedArcaQrClaimsV1["recipientDocumentType"],
    recipientDocumentNumber: grant.recipientDocumentNumber,
    payload: isPlainRecord(grant.payload) ? grant.payload as unknown as ArcaQrPayloadV1 : null,
    rawQrData: grant.rawQrData,
  };
  // The record was created by this server-only module. The CAS and query bind
  // its identity to the sale; malformed optional print data will simply fail
  // URL/raw resolution later without invalidating the authorized CAE save.
  const expectedAmount = expectedBinding.fiscalAmount === undefined
    ? null : decimalString(expectedBinding.fiscalAmount);
  const claimsValid = areClaimsValid(claims)
    && claims.businessId === expectedBinding.businessId
    && claims.cae === expectedBinding.cae
    && (expectedBinding.billType === undefined || claims.billType === expectedBinding.billType)
    && (expectedBinding.afipVoucherType === undefined || claims.afipVoucherType === expectedBinding.afipVoucherType)
    && (expectedBinding.invoiceNumber === undefined || claims.invoiceNumber === expectedBinding.invoiceNumber)
    && (expectedBinding.pointOfSale === undefined || claims.pointOfSale === expectedBinding.pointOfSale)
    && (expectedBinding.fiscalAmount === undefined
      || expectedAmount !== null && normalizedAmount === expectedAmount)
    && (expectedBinding.issuerCuit === undefined
      || normalizeArcaIssuerCuit(claims.issuerCuit) === normalizeArcaIssuerCuit(expectedBinding.issuerCuit))
    && (expectedBinding.recipientIvaCondition === undefined
      || claims.recipientIvaCondition === expectedBinding.recipientIvaCondition)
    && (expectedBinding.recipientDocumentType === undefined
      || (claims.recipientDocumentType || null) === (expectedBinding.recipientDocumentType || null))
    && (expectedBinding.recipientDocumentNumber === undefined
      || (claims.recipientDocumentNumber || null) === (expectedBinding.recipientDocumentNumber || null));
  if (!claimsValid) {
    logQrTelemetry({ stage: "save-consume-ref", outcome: "rejected", reason: normalizedDate && normalizedAmount ? "binding-mismatch" : "payload-invalid" });
    return null;
  }

  const claim = await tx.authorizedArcaQrGrant.updateMany({
    where: { id: grant.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (claim.count !== 1) {
    logQrTelemetry({ stage: "save-consume-ref", outcome: "rejected", reason: "grant-expired/replayed" });
    return null;
  }
  logQrTelemetry({ stage: "save-consume-ref", outcome: "accepted" });
  return { id: grant.id, claims };
}

function matchesPayloadGrant(payload: unknown, grant: Record<string, unknown>): boolean {
  if (!isPlainRecord(payload)) return false;
  const amount = decimalString(grant.fiscalAmount);
  const documentType = grant.recipientDocumentType;
  const expectedDocumentCode = documentType === "CUIT" ? 80 : documentType === "DNI" ? 96 : 99;
  const documentNumber = grant.recipientDocumentNumber;
  const expectedDocumentNumber = expectedDocumentCode === 99 ? 0 : Number(documentNumber);
  const issuerCuit = normalizeArcaIssuerCuit(grant.issuerCuit);
  return payload.codAut === Number(grant.cae)
    && payload.nroCmp === grant.invoiceNumber
    && payload.ptoVta === grant.pointOfSale
    && (grant.afipVoucherType === undefined || payload.tipoCmp === grant.afipVoucherType)
    && (grant.issuerCuit === undefined || issuerCuit !== null && payload.cuit === Number(issuerCuit))
    && (grant.fiscalAmount === undefined || decimalString(payload.importe) === amount)
    && (documentType === undefined || payload.tipoDocRec === expectedDocumentCode)
    && (documentNumber === undefined || payload.nroDocRec === expectedDocumentNumber)
    && payload.fecha === dateOnly(grant.requestDate as Date | string);
}

const NO_QR: ServerPrintQrDto = { qrValue: null, qrKind: "none" };

function optionalDocumentValue(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return typeof value === "string" ? value : undefined;
}

function decimalOrderAmount(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return decimalString(new Prisma.Decimal(value.toString()));
    } catch {
      return null;
    }
  }
  return decimalString(value);
}

/** One-time tenant-scoped adoption of exactly one already-consumed orphan grant. */
export async function repairConsumedOrphanArcaQrGrant(orderId: string): Promise<boolean> {
  if (typeof orderId !== "string" || !orderId.trim()) return false;
  const { auth } = await import("@/auth");
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return false;

  try {
    return await db.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, businessId } });
      if (!order || order.businessId !== businessId || order.qrDataPolicyVersion !== 1) return false;
      const caeData = isPlainRecord(order.CAE) ? order.CAE : null;
      if (!caeData || (Object.hasOwn(caeData, "qrAttestationId") && caeData.qrAttestationId !== null)) return false;

      const cae = caeData.CAE;
      const billType = order.billType;
      const afipVoucherType = billType === "Factura A" ? 1 : billType === "Factura B" ? 6 : billType === "Factura C" ? 11 : null;
      const invoiceNumber = Number(caeData.nroComprobante);
      const pointOfSale = Number(caeData.ptoVenta);
      const orderInvoiceNumber = order.invoiceNumber;
      const amount = decimalOrderAmount(order.total);
      const issuerCuit = await getTenantIssuerCuit(tx, businessId);
      const recipientIvaCondition = order.clientIvaCondition;
      const documentType = optionalDocumentValue(order.clientDocumentType);
      const documentNumber = optionalDocumentValue(order.clientDocumentNumber);

      if (typeof cae !== "string" || !/^\d{14}$/.test(cae)
        || typeof billType !== "string" || afipVoucherType === null
        || !Number.isSafeInteger(invoiceNumber) || invoiceNumber <= 0 || invoiceNumber !== orderInvoiceNumber
        || !Number.isSafeInteger(pointOfSale) || pointOfSale <= 0
        || order.invoicePointOfSale !== pointOfSale
        || !amount || !issuerCuit || !recipientIvaCondition?.trim()
        || (documentType !== null && documentType !== "CUIT" && documentType !== "DNI")
        || documentNumber === undefined || documentType === undefined) return false;

      const candidates = await tx.authorizedArcaQrGrant.findMany({
        where: {
          businessId,
          cae,
          billType,
          afipVoucherType,
          invoiceNumber,
          pointOfSale,
          fiscalAmount: amount,
          issuerCuit,
          recipientIvaCondition,
          recipientDocumentType: documentType,
          recipientDocumentNumber: documentNumber,
          consumedAt: { not: null },
          orderId: null,
        },
        take: 2,
      });
      if (candidates.length !== 1) return false;

      const grant = candidates[0];
      if (!grant || grant.orderId !== null || grant.consumedAt === null
        || grant.businessId !== businessId || grant.cae !== cae || grant.billType !== billType
        || grant.afipVoucherType !== afipVoucherType || grant.invoiceNumber !== invoiceNumber
        || grant.pointOfSale !== pointOfSale || decimalString(grant.fiscalAmount) !== amount
        || normalizeArcaIssuerCuit(grant.issuerCuit) !== issuerCuit
        || grant.recipientIvaCondition !== recipientIvaCondition
        || (grant.recipientDocumentType || null) !== documentType
        || (grant.recipientDocumentNumber || null) !== documentNumber) return false;

      const normalizedDate = dateOnly(grant.requestDate);
      const normalizedAmount = decimalString(grant.fiscalAmount);
      if (!normalizedDate || !normalizedAmount) return false;
      const claims: AuthorizedArcaQrClaimsV1 = {
        businessId: grant.businessId,
        cae: grant.cae,
        billType: grant.billType as AuthorizedArcaQrClaimsV1["billType"],
        afipVoucherType: grant.afipVoucherType as AuthorizedArcaQrClaimsV1["afipVoucherType"],
        invoiceNumber: grant.invoiceNumber,
        pointOfSale: grant.pointOfSale,
        fiscalAmount: normalizedAmount,
        issuerCuit: grant.issuerCuit,
        requestDate: normalizedDate,
        recipientIvaCondition: grant.recipientIvaCondition,
        recipientDocumentType: grant.recipientDocumentType as AuthorizedArcaQrClaimsV1["recipientDocumentType"],
        recipientDocumentNumber: grant.recipientDocumentNumber,
        payload: isPlainRecord(grant.payload) ? grant.payload as unknown as ArcaQrPayloadV1 : null,
        rawQrData: grant.rawQrData,
      };
      if (!areClaimsValid(claims)) return false;

      const linked = await tx.authorizedArcaQrGrant.updateMany({
        where: { id: grant.id, orderId: null, consumedAt: { not: null } },
        data: { orderId: order.id },
      });
      if (linked.count !== 1) return false;

      await tx.order.update({
        where: { id: order.id, businessId },
        data: {
          CAE: { ...caeData, qrAttestationId: grant.id } as Prisma.InputJsonValue,
        },
      });
      return true;
    });
  } catch {
    return false;
  }
}

function finishQrResolution(
  dto: ServerPrintQrDto,
  reason: QrTelemetryReason,
): ServerPrintQrDto {
  logQrTelemetry({
    stage: "resolve",
    outcome: dto.qrKind === "none" ? "rejected" : "completed",
    reason,
    qrKind: dto.qrKind,
  });
  if (dto.qrKind !== "none") {
    // This records the server-to-renderer handoff, not successful SVG/PNG output.
    logQrTelemetry({ stage: "render", outcome: "handoff", reason: "QR-ready", qrKind: dto.qrKind });
  }
  return dto;
}

/** Tenant-scoped printer data. Neither CAE JSON QR fields nor caller props are authorities. */
export async function resolveOrderQrPrintDto(orderId: string): Promise<ServerPrintQrDto> {
  if (typeof orderId !== "string" || !orderId.trim()) return finishQrResolution(NO_QR, "binding-mismatch");
  const { auth } = await import("@/auth");
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return finishQrResolution(NO_QR, "binding-mismatch");
  const order = await db.order.findFirst({ where: { id: orderId, businessId } });
  if (!order) return finishQrResolution(NO_QR, "binding-mismatch");

  const caeData = isPlainRecord(order.CAE) ? order.CAE : {};
  const grantId = typeof caeData.qrAttestationId === "string" ? caeData.qrAttestationId : null;
  if (order.qrDataPolicyVersion === 0 && !grantId) {
    const legacyRaw = caeData.qrData;
    return typeof legacyRaw === "string" && legacyRaw.trim().length > 0
      ? finishQrResolution({ qrValue: legacyRaw, qrKind: "legacy-raw" }, "QR-ready")
      : finishQrResolution(NO_QR, "payload-invalid");
  }
  if (!order || order.qrDataPolicyVersion !== 1 || !grantId) {
    return finishQrResolution(NO_QR, "policy-v1-no-ref");
  }

  const grant = await db.authorizedArcaQrGrant.findFirst({
    where: { id: grantId, businessId },
  });
  if (!grant) return finishQrResolution(NO_QR, "grant-row-missing");
  if (grant.businessId !== businessId || grant.cae !== caeData.CAE || grant.orderId !== order.id) {
    return finishQrResolution(NO_QR, "invoice-binding-mismatch");
  }
  const businessCuit = await getTenantIssuerCuit(db, businessId);
  if (businessCuit === null || businessCuit !== undefined
    && normalizeArcaIssuerCuit(grant.issuerCuit) !== normalizeArcaIssuerCuit(businessCuit)) {
    return finishQrResolution(NO_QR, "issuer-mismatch");
  }
  const invoiceNumber = Number(caeData.nroComprobante ?? order.invoiceNumber);
  if (!Number.isSafeInteger(invoiceNumber) || invoiceNumber !== grant.invoiceNumber) {
    return finishQrResolution(NO_QR, "invoice-binding-mismatch");
  }
  const pointOfSale = Number(caeData.ptoVenta ?? order.invoicePointOfSale);
  if (Number.isSafeInteger(pointOfSale) && pointOfSale > 0 && pointOfSale !== grant.pointOfSale) {
    return finishQrResolution(NO_QR, "invoice-binding-mismatch");
  }
  if (order.billType && order.billType !== grant.billType) {
    return finishQrResolution(NO_QR, "invoice-binding-mismatch");
  }
  if (order.afipVoucherType && order.afipVoucherType !== grant.afipVoucherType) {
    return finishQrResolution(NO_QR, "invoice-binding-mismatch");
  }
  if (typeof order.clientIvaCondition === "string"
    && order.clientIvaCondition !== grant.recipientIvaCondition) {
    return finishQrResolution(NO_QR, "invoice-binding-mismatch");
  }
  if (order.clientDocumentType !== undefined
    && (order.clientDocumentType || null) !== grant.recipientDocumentType) {
    return finishQrResolution(NO_QR, "invoice-binding-mismatch");
  }
  if (order.clientDocumentNumber !== undefined
    && (order.clientDocumentNumber || null) !== grant.recipientDocumentNumber) {
    return finishQrResolution(NO_QR, "invoice-binding-mismatch");
  }
  if (grant.fiscalAmount !== undefined
    && decimalOrderAmount(order.total) !== decimalString(grant.fiscalAmount)) {
    return finishQrResolution(NO_QR, "invoice-binding-mismatch");
  }

  const qrUrl = matchesPayloadGrant(grant.payload, grant)
    ? buildArcaQrUrl(grant.payload)
    : null;
  if (qrUrl) return finishQrResolution({ qrValue: qrUrl, qrKind: "verified-url" }, "QR-ready");
  if (typeof grant.rawQrData === "string" && grant.rawQrData.trim().length > 0) {
    return finishQrResolution({ qrValue: grant.rawQrData, qrKind: "verified-raw" }, "QR-ready");
  }
  return finishQrResolution(NO_QR, "payload-invalid");
}
