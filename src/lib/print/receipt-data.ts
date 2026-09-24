import type { CreditNotePrintContext, CreditNoteMetadata } from "@/models/CreditNote";

export type DocumentPrintKind = "official-invoice" | "remito" | "presupuesto" | "credit-note";
export type ReceiptDocumentType = "CUIT" | "DNI";

export interface ReceiptBusinessInfo {
  razonSocial?: string | null;
  cuit?: string | null;
  condicionIva?: string | null;
  inicioActividades?: Date | string | null;
  address?: string | null;
}

export interface ReceiptClientTaxData {
  name?: string | null;
  ivaCondition?: string | null;
  documentType?: "CUIT" | "DNI" | null;
  documentNumber?: string | null;
}

export function normalizeIvaCondition(value?: string | null): string | null {
  const normalized = value?.trim().replace(/_/g, " ");
  return normalized ? normalized : null;
}

export function buildReceiptClientData(input: ReceiptClientTaxData): ReceiptClientTaxData {
  return {
    name: input.name?.trim() || null,
    ivaCondition: normalizeIvaCondition(input.ivaCondition),
    documentType: input.documentType === "CUIT" || input.documentType === "DNI" ? input.documentType : null,
    documentNumber: input.documentNumber === undefined || input.documentNumber === null || input.documentNumber.trim() === ""
      ? null : input.documentNumber,
  };
}

export function normalizeHistoricalDocumentType(
  documentType?: string | null,
  documentNumber?: string | null,
): ReceiptDocumentType | "" {
  if (documentType === "CUIT" || documentType === "DNI") return documentType;

  const normalizedNumber = documentNumber?.trim();
  if (!normalizedNumber) return "";
  return normalizedNumber.length === 11 ? "CUIT" : "DNI";
}

export function getDocumentPrintKind(cae: string | null | undefined, billType?: string | null): DocumentPrintKind {
  const normalized = billType?.trim();
  if (normalized?.toLowerCase().startsWith("nota de crédito") || ["3", "6", "9"].includes(normalized ?? "")) return "credit-note";
  const isPresupuesto = normalized ? normalized.toLowerCase() === "presupuesto" : false;
  if (isPresupuesto && !cae?.trim()) return "presupuesto";
  return cae?.trim() ? "official-invoice" : "remito";
}

export function buildCreditNotePrintContext(input: unknown): CreditNotePrintContext | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = input as { order?: { total?: unknown; products?: unknown }; creditNote?: unknown };
  const note = value.creditNote as Partial<CreditNoteMetadata> | undefined;
  const positiveInteger = (candidate: unknown): candidate is number => typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0;
  const originalCae = typeof note?.originalCae === "string" ? note.originalCae.trim() : "";
  const products = Array.isArray(value.order?.products) ? value.order.products : [];
  const validProducts = products.length > 0 && products.every((product) => {
    if (typeof product !== "object" || product === null) return false;
    const item = product as Record<string, unknown>;
    return typeof item.description === "string" && item.description.trim() !== "" && typeof item.amount === "number" && Number.isFinite(item.amount) && item.amount > 0 && typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice) && item.unitPrice >= 0 && typeof item.subtotal === "number" && Number.isFinite(item.subtotal);
  });
  const validCreditNoteType = note?.afipVoucherType === undefined || note.afipVoucherType === 3 || note.afipVoucherType === 8 || note.afipVoucherType === 13;
  const validOriginalType = note?.originalAfipVoucherType === undefined || note.originalAfipVoucherType === 1 || note.originalAfipVoucherType === 6 || note.originalAfipVoucherType === 11;
  if (!note || note.status !== "AUTHORIZED" || typeof note.cae !== "string" || !/^\d{14}$/.test(note.cae.trim()) || !positiveInteger(note.number) || !positiveInteger(note.pointOfSale) || !validCreditNoteType || !note.billType || !["Nota de Crédito A", "Nota de Crédito B", "Nota de Crédito C"].includes(note.billType) || !note.originalBillType || !["Factura A", "Factura B", "Factura C"].includes(note.originalBillType) || !validOriginalType || !originalCae || !positiveInteger(note.originalNumber) || !positiveInteger(note.originalPointOfSale) || !validProducts || typeof value.order?.total !== "number" || !Number.isFinite(value.order.total) || value.order.total <= 0) return undefined;
  return {
    documentKind: "credit-note",
    creditNote: { ...note, cae: note.cae.trim(), number: note.number, pointOfSale: note.pointOfSale, status: "AUTHORIZED" } as CreditNotePrintContext["creditNote"],
    original: { billType: note.originalBillType as CreditNotePrintContext["original"]["billType"], cae: originalCae, number: note.originalNumber, pointOfSale: note.originalPointOfSale },
    products: products as CreditNotePrintContext["products"],
    total: typeof value.order?.total === "number" ? value.order.total : 0,
  };
}

/** Runtime guard for contexts crossing the Server Component/client boundary. */
export function isCreditNotePrintContext(input: unknown): input is CreditNotePrintContext {
  if (typeof input !== "object" || input === null) return false;
  const context = input as Partial<CreditNotePrintContext>;
  if (context.documentKind !== "credit-note" || !context.creditNote || !context.original || !Array.isArray(context.products)) return false;
  const rebuilt = buildCreditNotePrintContext({
    order: { total: context.total, products: context.products },
    creditNote: context.creditNote,
  });
  if (!rebuilt) return false;
  return context.original.cae === rebuilt.original.cae
    && context.original.number === rebuilt.original.number
    && context.original.pointOfSale === rebuilt.original.pointOfSale
    && context.original.billType === rebuilt.original.billType;
}

export function buildReceiptBusinessInfo(
  businessName: string,
  cae: string | null | undefined,
  businessInfo?: ReceiptBusinessInfo,
  billType?: string | null,
) {
  const documentKind = getDocumentPrintKind(cae, billType);
  return { businessName, documentKind, ...(documentKind === "official-invoice" && businessInfo ? { businessInfo } : {}) };
}
