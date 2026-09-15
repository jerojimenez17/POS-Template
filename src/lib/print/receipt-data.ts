export type DocumentPrintKind = "official-invoice" | "remito" | "presupuesto";
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
  const isPresupuesto = normalized ? normalized.toLowerCase() === "presupuesto" : false;
  if (isPresupuesto && !cae?.trim()) return "presupuesto";
  return cae?.trim() ? "official-invoice" : "remito";
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
