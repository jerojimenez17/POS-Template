import { normalizeCae } from "@/services/afip/credit-note";

export type SalesDocumentClass = "INVOICE_A" | "INVOICE_B" | "INVOICE_C" | "REMITO" | "UNKNOWN";
export type RecoveredSalesBillType = "Factura A" | "Factura B" | "Factura C" | "Remito";

interface FiscalSources {
  scalarBillType: unknown;
  scalarVoucherType: unknown;
  historicalBillTypes: unknown[];
  historicalVoucherTypes: unknown[];
  caeValues: unknown[];
  historicalTypeMetadata: boolean;
}

const BILL_TYPE_CLASS: Record<Exclude<RecoveredSalesBillType, "Remito">, SalesDocumentClass> = {
  "Factura A": "INVOICE_A",
  "Factura B": "INVOICE_B",
  "Factura C": "INVOICE_C",
};

const VOUCHER_TYPE_BILL: Record<number, Exclude<RecoveredSalesBillType, "Remito">> = {
  1: "Factura A",
  6: "Factura B",
  11: "Factura C",
};

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return parseMetadata(JSON.parse(value) as unknown);
    } catch {
      return undefined;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function getFiscalSources(order: Record<string, unknown>): FiscalSources {
  const caeValues = order.CAE === undefined ? [] : [order.CAE];
  const records = caeValues.map(parseMetadata).filter((value): value is Record<string, unknown> => value !== undefined);

  return {
    scalarBillType: order.billType,
    scalarVoucherType: order.afipVoucherType,
    historicalBillTypes: records.flatMap((record) => record.billType == null ? [] : [record.billType]),
    historicalVoucherTypes: records.flatMap((record) => record.afipVoucherType == null ? [] : [record.afipVoucherType]),
    caeValues: [
      ...caeValues.filter((value) => parseMetadata(value) === undefined),
      ...records.flatMap((record) => [record.CAE, record.cae].filter((value) => value !== undefined)),
    ],
    historicalTypeMetadata: records.some((record) => record.billType != null || record.afipVoucherType != null),
  };
}

function getExplicitBillType(value: unknown): RecoveredSalesBillType | undefined {
  return value === "Factura A" || value === "Factura B" || value === "Factura C" || value === "Remito"
    ? value
    : undefined;
}

function getVoucherBillType(value: unknown): RecoveredSalesBillType | undefined {
  return typeof value === "number" && Number.isInteger(value) ? VOUCHER_TYPE_BILL[value] : undefined;
}

function hasValidCae(values: unknown[]): boolean {
  return values.some((value) => {
    const normalized = normalizeCae(value);
    return typeof normalized === "string" && /^\d{14}$/.test(normalized);
  });
}

/**
 * Search presentation is intentionally based on authorization evidence alone.
 * It must not be combined with the stricter fiscal subtype recovery below.
 */
export function hasValidSalesPresentationCae(value: unknown): boolean {
  const record = parseMetadata(value);
  const caeValues = record
    ? [record.CAE, record.cae]
    : [value];
  return hasValidCae(caeValues);
}

export type SalesSearchPresentationClass = "FACTURA" | "REMITO";

export function classifySalesSearchPresentation(order: Record<string, unknown>): SalesSearchPresentationClass {
  return hasValidSalesPresentationCae(order.CAE) ? "FACTURA" : "REMITO";
}

/** Classifies solely from persisted bill/voucher metadata and valid CAE evidence. */
export function classifySalesDocument(order: Record<string, unknown>): SalesDocumentClass {
  const sources = getFiscalSources(order);
  const hasCae = hasValidCae(sources.caeValues);
  const scalarBillType = sources.scalarBillType == null ? undefined : getExplicitBillType(sources.scalarBillType);
  if (sources.scalarBillType != null && !scalarBillType) return "UNKNOWN";
  if (sources.scalarVoucherType != null && !getVoucherBillType(sources.scalarVoucherType)) return "UNKNOWN";

  // Historical CAE JSON is only a type source when its own persisted CAE is
  // valid. A JSON type value without authorization evidence is not enough.
  if (sources.historicalTypeMetadata && !hasCae) return "UNKNOWN";
  const historicalBillTypes = sources.historicalBillTypes.map(getExplicitBillType);
  const historicalVoucherTypes = sources.historicalVoucherTypes.map(getVoucherBillType);
  if (historicalBillTypes.some((value) => !value) || historicalVoucherTypes.some((value) => !value)) return "UNKNOWN";

  const allBillTypes = [
    ...(scalarBillType ? [scalarBillType] : []),
    ...(historicalBillTypes as RecoveredSalesBillType[]),
  ];
  const allVoucherBillTypes = [
    ...(sources.scalarVoucherType == null ? [] : [getVoucherBillType(sources.scalarVoucherType)!]),
    ...(historicalVoucherTypes as RecoveredSalesBillType[]),
  ];
  const billTypes = [...new Set(allBillTypes)];
  const voucherTypes = [...new Set(allVoucherBillTypes)];
  if (billTypes.length > 1 || voucherTypes.length > 1) return "UNKNOWN";
  const billType = billTypes[0];
  const voucherType = voucherTypes[0];
  if (billType && voucherType && billType !== voucherType) return "UNKNOWN";

  if (scalarBillType === "Remito") {
    // A remito is not inferred from a missing invoice CAE. Any valid CAE or
    // voucher type is positive fiscal evidence that makes this ambiguous.
    return hasCae || sources.scalarVoucherType != null || sources.historicalVoucherTypes.length > 0 ? "UNKNOWN" : "REMITO";
  }

  const resolvedType = billType ?? voucherType;
  if (!resolvedType || resolvedType === "Remito") return "UNKNOWN";
  if (!scalarBillType && !hasCae) return "UNKNOWN";
  return BILL_TYPE_CLASS[resolvedType];
}

export function getRecoveredSalesBillType(order: Record<string, unknown>): RecoveredSalesBillType | undefined {
  const classification = classifySalesDocument(order);
  switch (classification) {
    case "INVOICE_A": return "Factura A";
    case "INVOICE_B": return "Factura B";
    case "INVOICE_C": return "Factura C";
    case "REMITO": return "Remito";
    case "UNKNOWN": return undefined;
  }
}
