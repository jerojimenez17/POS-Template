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
  if (billType === "Presupuesto") return "Presupuesto";
  if (cae?.trim()) {
    if (billType && AFIP_INVOICE_TYPES[billType]) {
      return AFIP_INVOICE_TYPES[billType];
    }
    return billType || "Factura C";
  }
  
  return isRemito ? "Remito" : "Comprobante";
}

export function isAFIPAuthorized(billType?: string | null, cae?: string | null): boolean {
  return Boolean(cae?.trim());
}

export function getShortBillType(billType?: string | null): string {
  if (!billType) return "";
  const match = billType.match(/[A-C]$/);
  return match ? match[0] : billType.slice(0, 1).toUpperCase();
}

export interface InvoiceNumberParts {
  ptoVenta?: unknown;
  nroComprobante?: unknown;
}

function decimalInteger(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
    return String(value);
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const text = value.trim();
  return /^0+$/.test(text) ? null : text;
}

export function formatInvoiceNumberFull(nroComprobante?: unknown, ptoVenta?: unknown): string {
  if (typeof nroComprobante === "object" && nroComprobante !== null) {
    const parts = nroComprobante as InvoiceNumberParts;
    return formatInvoiceNumberFull(parts.nroComprobante, parts.ptoVenta);
  }
  const numberText = decimalInteger(nroComprobante);
  if (!numberText) return "";
  const pointText = decimalInteger(ptoVenta);
  if (pointText) {
    return `${pointText.padStart(3, "0")}-${numberText.padStart(4, "0")}`;
  }

  if (typeof nroComprobante === "string" && /^\d{7}$/.test(nroComprobante.trim())) {
    const historicalNumber = nroComprobante.trim();
    return `${historicalNumber.slice(0, 3)}-${historicalNumber.slice(3)}`;
  }

  return "";
}
