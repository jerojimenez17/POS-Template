export type DocumentPrintKind = "official-invoice" | "remito";

export interface ReceiptBusinessInfo {
  razonSocial?: string | null;
  cuit?: string | null;
  condicionIva?: string | null;
  inicioActividades?: Date | string | null;
  address?: string | null;
}

export function getDocumentPrintKind(cae: string | null | undefined): DocumentPrintKind {
  return cae?.trim() ? "official-invoice" : "remito";
}

export function buildReceiptBusinessInfo(businessName: string, cae: string | null | undefined, businessInfo?: ReceiptBusinessInfo) {
  const documentKind = getDocumentPrintKind(cae);
  return { businessName, documentKind, ...(documentKind === "official-invoice" && businessInfo ? { businessInfo } : {}) };
}
