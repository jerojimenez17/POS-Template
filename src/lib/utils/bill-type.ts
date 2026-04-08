export interface BillTypeInfo {
  displayName: string;
  isAFIPInvoice: boolean;
}

export const AFIP_INVOICE_TYPES: Record<string, string> = {
  "1": "Factura A",
  "2": "Nota de Debito A",
  "3": "Nota de Credito A",
  "4": "Factura B",
  "5": "Nota de Debito B",
  "6": "Nota de Credito B",
  "7": "Factura C",
  "8": "Nota de Debito C",
  "9": "Nota de Credito C",
};

export function getBillTypeDisplay(
  billType?: string | null,
  cae?: string | null,
  isRemito?: boolean
): string {
  if (cae) {
    if (billType && AFIP_INVOICE_TYPES[billType]) {
      return AFIP_INVOICE_TYPES[billType];
    }
    return billType || "Factura C";
  }
  
  return isRemito ? "Remito" : "Comprobante";
}

export function isAFIPAuthorized(billType?: string | null, cae?: string | null): boolean {
  return Boolean(cae);
}

export function getShortBillType(billType?: string | null): string {
  if (!billType) return "";
  const match = billType.match(/[A-C]$/);
  return match ? match[0] : billType.slice(0, 1).toUpperCase();
}

export function formatInvoiceNumberFull(nroComprobante?: number): string {
  if (!nroComprobante) return "";
  const nroStr = String(nroComprobante);
  if (nroStr.length === 12) {
    const ptoVta = nroStr.slice(0, 4);
    const nroCmp = nroStr.slice(4);
    return `${ptoVta}-${nroCmp}`;
  }
  return nroStr;
}
