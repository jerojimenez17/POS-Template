export type DocumentPrintKind = "official-invoice" | "remito" | "presupuesto";

export interface ReceiptBusinessInfo {
  razonSocial?: string | null;
  cuit?: string | null;
  condicionIva?: string | null;
  inicioActividades?: Date | string | null;
  address?: string | null;
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
