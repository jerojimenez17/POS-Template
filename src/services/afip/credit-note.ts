import type { AfipVoucherType } from "./point-sale-validation";

export type CreditNoteAfipType = 3 | 8 | 13;
export type OriginalBillType = "Factura A" | "Factura B" | "Factura C";

export interface AuthorizedFiscalSnapshotV1 {
  readonly version: 1;
  readonly source: "AUTHORIZED_VOUCHER";
  readonly billType: OriginalBillType;
  readonly afipVoucherType: 1 | 6 | 11;
  readonly issuerIvaCondition: string;
  readonly buyerIvaCondition: string;
  readonly currency: "ARS";
  readonly total: number;
  readonly net: number;
  readonly vat: number;
  readonly nonTaxed: number;
  readonly exempt: number;
  readonly otherTaxes: number;
  readonly iva: readonly { readonly id: number; readonly base: number; readonly amount: number }[];
}

export interface FiscalBreakdownV1 {
  readonly source: "AUTHORIZED_VOUCHER";
  readonly version: 1;
  readonly originalAfipVoucherType: 1 | 6 | 11;
  readonly ImpTotal: number;
  readonly ImpNeto: number;
  readonly ImpIVA: number;
  readonly ImpTotConc: number;
  readonly ImpOpEx: number;
  readonly ImpTrib: number;
  readonly Iva: readonly { readonly Id: number; readonly BaseImp: number; readonly Importe: number }[];
}

export function normalizeFiscalBreakdown(
  value: unknown,
  expected?: { originalAfipVoucherType?: number; total?: number },
): FiscalBreakdownV1 | undefined {
  if (!isRecord(value) || value.source !== "AUTHORIZED_VOUCHER" || value.version !== 1
    || ![1, 6, 11].includes(value.originalAfipVoucherType as number)
    || !finiteNonNegative(value.ImpTotal) || !finiteNonNegative(value.ImpNeto) || !finiteNonNegative(value.ImpIVA)
    || !finiteNonNegative(value.ImpTotConc) || !finiteNonNegative(value.ImpOpEx) || !finiteNonNegative(value.ImpTrib)
    || !Array.isArray(value.Iva)) return undefined;

  const originalType = value.originalAfipVoucherType as 1 | 6 | 11;
  if (expected?.originalAfipVoucherType !== undefined && originalType !== expected.originalAfipVoucherType) return undefined;
  if (expected?.total !== undefined && (!Number.isFinite(expected.total) || !moneyMatches(value.ImpTotal, expected.total))) return undefined;
  const iva: { Id: number; BaseImp: number; Importe: number }[] = [];
  const ids = new Set<number>();
  for (const item of value.Iva) {
    if (!isRecord(item) || typeof item.Id !== "number" || !Number.isSafeInteger(item.Id) || item.Id <= 0
      || ids.has(item.Id) || !finiteNonNegative(item.BaseImp) || !finiteNonNegative(item.Importe)) return undefined;
    ids.add(item.Id);
    iva.push({ Id: item.Id, BaseImp: item.BaseImp, Importe: item.Importe });
  }
  if (!moneyMatches(value.ImpIVA, iva.reduce((sum, group) => sum + group.Importe, 0))
    || !moneyMatches(value.ImpTotal, value.ImpNeto + value.ImpIVA + value.ImpTotConc + value.ImpOpEx + value.ImpTrib)) return undefined;
  if (originalType === 11) {
    if (iva.length > 0 || value.ImpIVA !== 0) return undefined;
  } else {
    if (value.ImpNeto > 0 && iva.length === 0) return undefined;
    if (!moneyMatches(value.ImpNeto, iva.reduce((sum, group) => sum + group.BaseImp, 0))) return undefined;
  }
  return Object.freeze({
    source: "AUTHORIZED_VOUCHER",
    version: 1,
    originalAfipVoucherType: originalType,
    ImpTotal: value.ImpTotal,
    ImpNeto: value.ImpNeto,
    ImpIVA: value.ImpIVA,
    ImpTotConc: value.ImpTotConc,
    ImpOpEx: value.ImpOpEx,
    ImpTrib: value.ImpTrib,
    Iva: Object.freeze(iva.map((group) => Object.freeze(group))),
  });
}

const billTypeVoucher: Record<OriginalBillType, 1 | 6 | 11> = {
  "Factura A": 1,
  "Factura B": 6,
  "Factura C": 11,
};

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function moneyMatches(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.0100001;
}

/** Validates and defensively copies a snapshot returned by an authorized voucher response. */
export function normalizeAuthorizedFiscalSnapshot(
  value: unknown,
  expected?: { billType?: OriginalBillType; afipVoucherType?: number; total?: number },
): AuthorizedFiscalSnapshotV1 | undefined {
  if (!isRecord(value)
    || value.version !== 1
    || value.source !== "AUTHORIZED_VOUCHER"
    || (value.billType !== "Factura A" && value.billType !== "Factura B" && value.billType !== "Factura C")
    || value.afipVoucherType !== billTypeVoucher[value.billType]
    || (value.currency !== "ARS")
    || typeof value.issuerIvaCondition !== "string" || value.issuerIvaCondition.trim() === ""
    || typeof value.buyerIvaCondition !== "string" || value.buyerIvaCondition.trim() === ""
    || !finiteNonNegative(value.total) || !finiteNonNegative(value.net) || !finiteNonNegative(value.vat)
    || !finiteNonNegative(value.nonTaxed) || !finiteNonNegative(value.exempt) || !finiteNonNegative(value.otherTaxes)
    || !Array.isArray(value.iva)) return undefined;

  const iva: { id: number; base: number; amount: number }[] = [];
  const seenIds = new Set<number>();
  for (const group of value.iva) {
    if (!isRecord(group) || typeof group.id !== "number" || !Number.isSafeInteger(group.id) || group.id <= 0
      || seenIds.has(group.id) || !finiteNonNegative(group.base) || !finiteNonNegative(group.amount)) return undefined;
    seenIds.add(group.id);
    iva.push({ id: group.id, base: group.base, amount: group.amount });
  }

  const billType = value.billType;
  if (expected?.billType !== undefined && expected.billType !== billType) return undefined;
  if (expected?.afipVoucherType !== undefined && expected.afipVoucherType !== value.afipVoucherType) return undefined;
  if (expected?.total !== undefined && (!Number.isFinite(expected.total) || !moneyMatches(value.total, expected.total))) return undefined;
  if (!moneyMatches(value.vat, iva.reduce((sum, group) => sum + group.amount, 0))) return undefined;
  if (!moneyMatches(value.total, value.net + value.vat + value.nonTaxed + value.exempt + value.otherTaxes)) return undefined;

  if (billType === "Factura C") {
    if (iva.length > 0 || value.vat !== 0) return undefined;
  } else {
    if (value.net > 0 && iva.length === 0) return undefined;
    if (!moneyMatches(value.net, iva.reduce((sum, group) => sum + group.base, 0))) return undefined;
  }

  return Object.freeze({
    version: 1,
    source: "AUTHORIZED_VOUCHER",
    billType,
    afipVoucherType: value.afipVoucherType as 1 | 6 | 11,
    issuerIvaCondition: value.issuerIvaCondition,
    buyerIvaCondition: value.buyerIvaCondition,
    currency: "ARS",
    total: value.total,
    net: value.net,
    vat: value.vat,
    nonTaxed: value.nonTaxed,
    exempt: value.exempt,
    otherTaxes: value.otherTaxes,
    iva: Object.freeze(iva.map((group) => Object.freeze(group))),
  });
}

export interface SaleFiscalProduct {
  id: string;
  description: string;
  amount: number;
  salePrice: number;
}

export interface SaleFiscalContext {
  orderId: string;
  billType: OriginalBillType;
  originalAfipVoucherType: 1 | 6 | 11;
  originalCAE: string;
  invoiceNumber: number;
  invoicePointOfSale: number;
  total: number;
  products: SaleFiscalProduct[];
  creditNote: { status: "PENDING" | "AUTHORIZED" | "REJECTED"; canFinalizeLocally?: boolean } | null;
  eligibleForFullCreditNote: boolean;
}

export interface NormalizedSaleFiscalMetadata {
  billType: OriginalBillType;
  originalAfipVoucherType: 1 | 6 | 11;
  originalCAE: string;
  invoiceNumber: number;
  invoicePointOfSale: number;
}

export type FiscalDiagnosticReason = "CAE_INVALID" | "FISCAL_FIELDS_INCOMPLETE" | "FISCAL_TYPE_CONFLICT" | "FISCAL_TYPE_UNSUPPORTED";
export type MissingFiscalField = "billType" | "invoicePointOfSale" | "invoiceNumber";
export type SaleFiscalMetadataResult =
  | { status: "VALID"; metadata: NormalizedSaleFiscalMetadata }
  | { status: "NON_FISCAL" }
  | { status: "INVALID_OR_INCOMPLETE"; reason: FiscalDiagnosticReason; hasCaeSignal: true; missingFields?: MissingFiscalField[]; canCompleteFromUser: boolean };

export interface SaleFiscalDiagnostic {
  status: "INVALID_OR_INCOMPLETE" | "INELIGIBLE";
  reason: FiscalDiagnosticReason | "ALREADY_AUTHORIZED" | "SALE_CONTENT_INCOMPLETE" | "FISCAL_SNAPSHOT_MISSING";
  message: string;
  missingFields?: MissingFiscalField[];
  canCompleteFromUser?: boolean;
}

export interface SaleFiscalRecovery {
  orderId: string;
  missingFields: MissingFiscalField[];
  known: { billType?: OriginalBillType; invoiceNumber?: number; invoicePointOfSale?: number };
  total: number;
  products: SaleFiscalProduct[];
  creditNoteStatus: "PENDING" | "AUTHORIZED" | "REJECTED" | null;
}

export const CREDIT_NOTE_NON_ACTIONABLE_MESSAGE = "No se puede emitir la Nota de Crédito porque los datos fiscales no son válidos o son inconsistentes. Revisá el comprobante original.";

const CAE_PATTERN = /^\d{14}$/;
const PLACEHOLDER_VALUES = new Set(["", "undefined", "null", "nan", "none", "n/a", "na", "s/d", "sin cae", "sin dato"]);

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { return readRecord(JSON.parse(value) as unknown); } catch { return {}; }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseHistoricalRecords(values: unknown[]): Record<string, unknown>[] {
  return values.map(readRecord).filter((record) => Object.keys(record).length > 0);
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return undefined;
  const candidate = Number(value.trim());
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : undefined;
}

function hasSignal(value: unknown): boolean {
  if (typeof value === "number") return true;
  return typeof value === "string" && !PLACEHOLDER_VALUES.has(value.trim().toLowerCase()) && value.trim() !== "";
}

function hasCaeField(record: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(record, "CAE") || Object.prototype.hasOwnProperty.call(record, "cae");
}

function valuesFor(record: Record<string, unknown>, aliases: readonly string[]): unknown[] {
  return aliases.flatMap((alias) => record[alias] === undefined ? [] : [record[alias]]);
}

function valuesForRecords(records: Record<string, unknown>[], aliases: readonly string[]): unknown[] {
  return records.flatMap((record) => valuesFor(record, aliases));
}

function oneValidValue<T>(values: unknown[], normalize: (value: unknown) => T | undefined): { value?: T; conflict: boolean; invalid: boolean } {
  const present = values.filter((value) => value !== undefined);
  const normalized = present.map(normalize);
  if (normalized.some((value) => value === undefined)) return { conflict: false, invalid: true };
  const distinct = [...new Set(normalized as T[])];
  return { value: distinct[0], conflict: distinct.length > 1, invalid: false };
}

export function normalizeCae(value: unknown): string | undefined {
  const raw = typeof value === "string" ? value.trim() : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  const normalized = raw.toLowerCase().replace(/[\[\](){}]/g, "").replace(/[\s_-]+/g, " ").trim();
  if (PLACEHOLDER_VALUES.has(normalized) || normalized.startsWith("placeholder") || normalized.includes("placeholder cae")) return undefined;
  return raw;
}

export interface FiscalDiagnosticLogFields {
  source: "columns" | "historical_json" | "mixed" | "none";
  hasCaeSignal: boolean;
  hasValidCae: boolean;
  hasInvoiceNumber: boolean;
  hasPointOfSale: boolean;
  hasBillType: boolean;
  hasVoucherType: boolean;
}

export function getFiscalDiagnosticLogFields(input: Record<string, unknown>, result: SaleFiscalMetadataResult): FiscalDiagnosticLogFields {
  const rawValues = [input.CAE, input.cae].filter((value) => value !== undefined);
  const historicalRecords = parseHistoricalRecords(rawValues);
  const columnCaeValues = rawValues.filter((value) => Object.keys(readRecord(value)).length === 0);
  const historicalCae = valuesForRecords(historicalRecords, ["CAE", "cae"]);
  const columnNumber = valuesFor(input, ["invoiceNumber", "nroComprobante", "number"]);
  const historicalNumber = valuesForRecords(historicalRecords, ["invoiceNumber", "nroComprobante", "number"]);
  const columnPos = valuesFor(input, ["invoicePointOfSale", "ptoVenta", "pointOfSale"]);
  const historicalPos = valuesForRecords(historicalRecords, ["invoicePointOfSale", "ptoVenta", "pointOfSale"]);
  const columnBill = valuesFor(input, ["billType"]);
  const historicalBill = valuesForRecords(historicalRecords, ["billType"]);
  const columnVoucher = valuesFor(input, ["afipVoucherType"]);
  const historicalVoucher = valuesForRecords(historicalRecords, ["afipVoucherType"]);
  // `source` describes where the CAE was found. Other fiscal fields may be
  // deliberately distributed between columns and the historical JSON.
  const columnSignal = columnCaeValues.some(hasSignal);
  const historicalSignal = historicalCae.some(hasSignal);
  return {
    source: columnSignal && historicalSignal ? "mixed" : columnSignal ? "columns" : historicalSignal ? "historical_json" : "none",
    hasCaeSignal: result.status === "INVALID_OR_INCOMPLETE" ? result.hasCaeSignal : columnCaeValues.some(hasSignal) || historicalCae.some(hasSignal),
    hasValidCae: result.status === "VALID",
    hasInvoiceNumber: [...columnNumber, ...historicalNumber].some((value) => readInteger(value) !== undefined),
    hasPointOfSale: [...columnPos, ...historicalPos].some((value) => readInteger(value) !== undefined),
    hasBillType: [...columnBill, ...historicalBill].some((value) => toBillType(value) !== undefined),
    hasVoucherType: [...columnVoucher, ...historicalVoucher].some((value) => readInteger(value) !== undefined),
  };
}

function toBillType(value: unknown): OriginalBillType | undefined {
  if (value === "Factura A" || value === "A") return "Factura A";
  if (value === "Factura B" || value === "B") return "Factura B";
  if (value === "Factura C" || value === "C") return "Factura C";
  return undefined;
}

/** Normalize both current columns and the historical CAE JSON. Conflicts are unsafe. */
export function normalizeSaleFiscalMetadata(input: {
  billType?: unknown;
  afipVoucherType?: unknown;
  invoiceNumber?: unknown;
  invoicePointOfSale?: unknown;
  cae?: unknown;
  [key: string]: unknown;
}): SaleFiscalMetadataResult {
  const rawValues = [input.CAE, input.cae].filter((value) => value !== undefined);
  const records = parseHistoricalRecords(rawValues);
  const columnCaeValues = rawValues.filter((value) => Object.keys(readRecord(value)).length === 0);
  const historicalCaeValues = valuesForRecords(records, ["CAE", "cae"]);
  const hasFiscalField = [
    ...valuesFor(input, ["billType", "afipVoucherType", "invoiceNumber", "invoicePointOfSale", "number", "pointOfSale"]),
    ...valuesForRecords(records, ["billType", "afipVoucherType", "invoiceNumber", "invoicePointOfSale", "number", "pointOfSale"]),
  ].some((value) => value !== undefined);
  const hasEmptyCae = rawValues.some((value) => typeof value === "string" && value.trim() === "");
  // Lowercase `cae` was historically used as an optional field by manual
  // sales. An empty persisted `CAE` column, however, is an explicit fiscal
  // signal and must be diagnosed when fiscal columns accompany it.
  const emptyOptionalAlias = input.cae === "" && input.CAE === undefined;
  const caeSignal = rawValues.some(hasSignal) || (hasEmptyCae && hasFiscalField && !emptyOptionalAlias)
    || records.some(hasCaeField) || historicalCaeValues.some(hasSignal);
  if (!caeSignal && hasFiscalField && Object.prototype.hasOwnProperty.call(input, "CAE")) return { status: "INVALID_OR_INCOMPLETE", reason: "CAE_INVALID", hasCaeSignal: true, canCompleteFromUser: false };
  if (!caeSignal) return { status: "NON_FISCAL" };
  // QR metadata is auxiliary and may accompany a valid historical CAE. A URL
  // presented directly as the CAE value is unsafe.
  if (rawValues.some((value) => typeof value === "string" && /^https?:\/\//i.test(value.trim()))) {
    return { status: "INVALID_OR_INCOMPLETE", reason: "CAE_INVALID", hasCaeSignal: true, canCompleteFromUser: false };
  }
  const cae = oneValidValue([...columnCaeValues, ...historicalCaeValues], normalizeCae);
  if (cae.invalid) {
    return { status: "INVALID_OR_INCOMPLETE", reason: "CAE_INVALID", hasCaeSignal: true, canCompleteFromUser: false };
  }
  if (typeof cae.value === "string" && /^https?:\/\//i.test(cae.value)) {
    return { status: "INVALID_OR_INCOMPLETE", reason: "CAE_INVALID", hasCaeSignal: true, canCompleteFromUser: false };
  }
  if (cae.conflict) {
    return { status: "INVALID_OR_INCOMPLETE", reason: "FISCAL_FIELDS_INCOMPLETE", hasCaeSignal: true, canCompleteFromUser: false };
  }
  const bill = oneValidValue([...valuesFor(input, ["billType"]), ...valuesForRecords(records, ["billType"])], toBillType);
  const voucher = oneValidValue([...valuesFor(input, ["afipVoucherType"]), ...valuesForRecords(records, ["afipVoucherType"])], readInteger);
  if (bill.invalid || voucher.invalid) return { status: "INVALID_OR_INCOMPLETE", reason: "FISCAL_TYPE_UNSUPPORTED", hasCaeSignal: true, canCompleteFromUser: false };
  if (bill.conflict || voucher.conflict) {
    return { status: "INVALID_OR_INCOMPLETE", reason: "FISCAL_TYPE_CONFLICT", hasCaeSignal: true, canCompleteFromUser: false };
  }
  if (bill.value && voucher.value && originalTypes[bill.value] !== voucher.value) {
    return { status: "INVALID_OR_INCOMPLETE", reason: "FISCAL_TYPE_CONFLICT", hasCaeSignal: true, canCompleteFromUser: false };
  }
  if (voucher.value !== undefined && ![1, 6, 11].includes(voucher.value)) return { status: "INVALID_OR_INCOMPLETE", reason: "FISCAL_TYPE_UNSUPPORTED", hasCaeSignal: true, canCompleteFromUser: false };
  const resolvedBill = bill.value ?? (voucher.value === 1 ? "Factura A" : voucher.value === 6 ? "Factura B" : voucher.value === 11 ? "Factura C" : undefined);
  const resolvedVoucher = voucher.value ?? (bill.value ? originalTypes[bill.value] : undefined);
  if (bill.value && voucher.value && originalTypes[bill.value] !== voucher.value) return { status: "INVALID_OR_INCOMPLETE", reason: "FISCAL_TYPE_CONFLICT", hasCaeSignal: true, canCompleteFromUser: false };
  const number = oneValidValue([...valuesFor(input, ["invoiceNumber", "nroComprobante", "number"]), ...valuesForRecords(records, ["invoiceNumber", "nroComprobante", "number"])], readInteger);
  const pointOfSale = oneValidValue([...valuesFor(input, ["invoicePointOfSale", "ptoVenta", "pointOfSale"]), ...valuesForRecords(records, ["invoicePointOfSale", "ptoVenta", "pointOfSale"])], readInteger);
  if (number.invalid || pointOfSale.invalid || number.conflict || pointOfSale.conflict) return { status: "INVALID_OR_INCOMPLETE", reason: "FISCAL_FIELDS_INCOMPLETE", hasCaeSignal: true, canCompleteFromUser: false };
  const missingFields: MissingFiscalField[] = [];
  if (!resolvedBill || !resolvedVoucher) missingFields.push("billType");
  if (!number.value && !number.invalid && !number.conflict) missingFields.push("invoiceNumber");
  if (!pointOfSale.value && !pointOfSale.invalid && !pointOfSale.conflict) missingFields.push("invoicePointOfSale");
  if (!cae.value || !resolvedBill || !resolvedVoucher || !number.value || !pointOfSale.value) {
    return {
      status: "INVALID_OR_INCOMPLETE",
      reason: "FISCAL_FIELDS_INCOMPLETE",
      hasCaeSignal: true,
      canCompleteFromUser: Boolean(cae.value && missingFields.length > 0),
      ...(cae.value && missingFields.length > 0 ? { missingFields } : {}),
    };
  }
  return {
    status: "VALID", metadata: {
      billType: resolvedBill,
      originalAfipVoucherType: resolvedVoucher as 1 | 6 | 11,
      originalCAE: cae.value,
      invoiceNumber: number.value,
      invoicePointOfSale: pointOfSale.value,
    }
  };
}

const originalTypes: Record<OriginalBillType, AfipVoucherType> = {
  "Factura A": 1,
  "Factura B": 6,
  "Factura C": 11,
};

const creditNoteTypes: Record<OriginalBillType, CreditNoteAfipType> = {
  "Factura A": 3,
  "Factura B": 8,
  "Factura C": 13,
};

export function mapOriginalBillTypeToInvoiceAfipType(billType: string): AfipVoucherType {
  const type = originalTypes[billType as OriginalBillType];
  if (!type) throw new Error("Solo se admiten Factura A, Factura B o Factura C");
  return type;
}

export function mapOriginalBillTypeToCreditNoteAfipType(billType: string): CreditNoteAfipType {
  const type = creditNoteTypes[billType as OriginalBillType];
  if (!type) throw new Error("Solo se admiten Factura A, Factura B o Factura C para una Nota de Crédito");
  return type;
}

export function buildCreditNoteAssociation(input: {
  originalVoucherType: AfipVoucherType;
  pointOfSale: number;
  number: number;
  issuedAt?: Date;
}): Record<string, unknown> {
  return {
    Tipo: input.originalVoucherType,
    PtoVta: input.pointOfSale,
    Nro: input.number,
    ...(input.issuedAt ? { CbteFch: input.issuedAt.toISOString().slice(0, 10).replaceAll("-", "") } : {}),
  };
}

interface CreditNoteProduct {
  id: string;
  code: string;
  description: string;
  price: number;
  salePrice: number;
  amount: number;
}

export interface CreditNoteVoucherStateInput {
  billType: OriginalBillType;
  /** Server-resolved emission POS. Optional only for legacy mapping-only callers. */
  emissionPointOfSale?: number;
  nroAsociado: number;
  ptoVentaAsociado: number;
  caeAsociado: string;
  products: CreditNoteProduct[];
  total: number;
  totalWithDiscount: number;
  discount?: number;
  fiscalSnapshot?: unknown;
  IVACondition: string;
  clientDocumentType?: string;
  clientDocumentNumber?: string;
}

export interface CreditNoteVoucherState {
  billType: OriginalBillType;
  ptoVenta?: number;
  nroAsociado: number;
  ptoVentaAsociado: number;
  caeAsociado: string;
  products: CreditNoteProduct[];
  total: number;
  totalWithDiscount: number;
  discount: 0;
  fiscalSnapshot?: AuthorizedFiscalSnapshotV1;
  IVACondition: string;
  clientDocumentType?: string;
  clientDocumentNumber?: string;
  CbtesAsoc?: Array<Record<string, unknown>>;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function buildCreditNoteVoucherState(input: CreditNoteVoucherStateInput): CreditNoteVoucherState {
  if (!isPositiveSafeInteger(input.nroAsociado) || !isPositiveSafeInteger(input.ptoVentaAsociado)) {
    throw new Error("Los datos fiscales del comprobante original no son válidos");
  }
  if (input.emissionPointOfSale !== undefined && !isPositiveSafeInteger(input.emissionPointOfSale)) {
    throw new Error("El punto de venta de emisión de la Nota de Crédito no es válido");
  }
  const fiscalSnapshot = input.fiscalSnapshot === undefined ? undefined : normalizeAuthorizedFiscalSnapshot(input.fiscalSnapshot, {
    billType: input.billType,
    total: input.total,
  });
  if (input.fiscalSnapshot !== undefined && (!fiscalSnapshot || !moneyMatches(input.totalWithDiscount, fiscalSnapshot.total))) {
    throw new Error("No está disponible un desglose fiscal autorizado válido para la Nota de Crédito");
  }

  const state: CreditNoteVoucherState = {
    billType: input.billType,
    ...(input.emissionPointOfSale === undefined ? {} : { ptoVenta: input.emissionPointOfSale }),
    nroAsociado: input.nroAsociado,
    ptoVentaAsociado: input.ptoVentaAsociado,
    caeAsociado: input.caeAsociado,
    products: input.products.map((product) => ({ ...product })),
    total: input.total,
    totalWithDiscount: input.totalWithDiscount,
    discount: 0,
    ...(fiscalSnapshot ? { fiscalSnapshot } : {}),
    IVACondition: input.IVACondition,
  };
  if (input.clientDocumentType !== undefined) state.clientDocumentType = input.clientDocumentType;
  if (input.clientDocumentNumber !== undefined) state.clientDocumentNumber = input.clientDocumentNumber;
  state.CbtesAsoc = [buildCreditNoteAssociation({
    originalVoucherType: mapOriginalBillTypeToInvoiceAfipType(input.billType),
    pointOfSale: input.ptoVentaAsociado,
    number: input.nroAsociado,
  })];
  return state;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCreditNoteVoucherStateInput(value: unknown, emissionPointOfSale: unknown): CreditNoteVoucherStateInput {
  if (!isRecord(value)) throw new Error("Los datos de la Nota de Crédito no son válidos");
  const billType = value.billType;
  if (billType !== "Factura A" && billType !== "Factura B" && billType !== "Factura C") {
    throw new Error("El tipo de comprobante original no es válido");
  }
  const productsValue = value.products;
  if (!Array.isArray(productsValue)) throw new Error("El detalle de productos de la Nota de Crédito no es válido");
  const products = productsValue.map((product): CreditNoteProduct => {
    if (!isRecord(product)
      || typeof product.id !== "string"
      || typeof product.code !== "string"
      || typeof product.description !== "string"
      || typeof product.price !== "number"
      || !Number.isFinite(product.price)
      || typeof product.salePrice !== "number"
      || !Number.isFinite(product.salePrice)
      || typeof product.amount !== "number"
      || !Number.isFinite(product.amount)) {
      throw new Error("El detalle de productos de la Nota de Crédito no es válido");
    }
    return {
      id: product.id,
      code: product.code,
      description: product.description,
      price: product.price,
      salePrice: product.salePrice,
      amount: product.amount,
    };
  });
  const requiredNumber = (field: string): number => {
    const fieldValue = value[field];
    if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) {
      throw new Error(`El campo ${field} de la Nota de Crédito no es válido`);
    }
    return fieldValue;
  };
  if (typeof value.caeAsociado !== "string" || typeof value.IVACondition !== "string") {
    throw new Error("Los datos fiscales de la Nota de Crédito no son válidos");
  }
  if (emissionPointOfSale !== undefined && !isPositiveSafeInteger(emissionPointOfSale)) {
    throw new Error("El punto de venta de emisión de la Nota de Crédito no es válido");
  }
  const input: CreditNoteVoucherStateInput = {
    billType,
    nroAsociado: requiredNumber("nroAsociado"),
    ptoVentaAsociado: requiredNumber("ptoVentaAsociado"),
    caeAsociado: value.caeAsociado,
    products,
    total: requiredNumber("total"),
    totalWithDiscount: requiredNumber("totalWithDiscount"),
    fiscalSnapshot: value.fiscalSnapshot,
    IVACondition: value.IVACondition,
    ...(typeof value.clientDocumentType === "string" ? { clientDocumentType: value.clientDocumentType } : {}),
    ...(typeof value.clientDocumentNumber === "string" ? { clientDocumentNumber: value.clientDocumentNumber } : {}),
    ...(emissionPointOfSale === undefined ? {} : { emissionPointOfSale }),
  };
  return input;
}

export function buildCreditNoteCreateVoucherPayload(input: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(input.arca)) throw new Error("La configuración ARCA de la Nota de Crédito no es válida");
  const arca = input.arca;
  const rawBillState = input.billState;
  const billState = buildCreditNoteVoucherState(
    readCreditNoteVoucherStateInput(
      rawBillState,
      isRecord(rawBillState) ? rawBillState.emissionPointOfSale ?? arca.puntoVenta : arca.puntoVenta,
    ),
  );
  const originalType = mapOriginalBillTypeToInvoiceAfipType(billState.billType);
  const snapshot = billState.fiscalSnapshot;
  if (!snapshot) throw new Error("No está disponible un desglose fiscal autorizado válido para la Nota de Crédito");
  const fiscalBreakdown = {
    source: snapshot.source,
    version: snapshot.version,
    originalAfipVoucherType: snapshot.afipVoucherType,
    ImpTotal: snapshot.total,
    ImpNeto: snapshot.net,
    ImpIVA: snapshot.vat,
    ImpTotConc: snapshot.nonTaxed,
    ImpOpEx: snapshot.exempt,
    ImpTrib: snapshot.otherTaxes,
    Iva: snapshot.iva.map(({ id, base, amount }) => ({ Id: id, BaseImp: base, Importe: amount })),
  };
  billState.CbtesAsoc = [buildCreditNoteAssociation({
    originalVoucherType: originalType,
    pointOfSale: billState.ptoVentaAsociado,
    number: billState.nroAsociado,
  })];
  const payloadBillState: CreditNoteVoucherState = { ...billState };
  delete payloadBillState.fiscalSnapshot;
  return {
    action: "createVoucher",
    arca: { ...arca, tipoFactura: mapOriginalBillTypeToCreditNoteAfipType(billState.billType) },
    billState: { ...payloadBillState, fiscalBreakdown } as unknown as Record<string, unknown>,
  };
}

export function validateCreditNoteVoucherType(type: number, operation: "invoice" | "credit-note" = "credit-note"): void {
  if (operation === "credit-note" && ![3, 8, 13].includes(type)) throw new Error("Tipo de Nota de Crédito inválido");
  if (operation === "invoice" && [3, 8, 13].includes(type)) throw new Error("Las Notas de Crédito no son facturas");
  if (operation === "invoice" && ![1, 6, 11].includes(type)) throw new Error("Tipo de factura inválido");
}

export function parseCreditNoteResponse(input: unknown, original: Record<string, unknown>): Record<string, unknown> {
  const response = typeof input === "object" && input !== null
    ? input as Record<string, unknown>
    : {};
  const responseCae = response.cae ?? response.CAE;
  // AFIP authorization is only valid with the exact wire representation. Do
  // not trim, coerce, or accept labels such as `NEW-CAE` here.
  const cae = typeof responseCae === "string" && CAE_PATTERN.test(responseCae) ? responseCae : undefined;
  const number = response.nroComprobante ?? response.nroCbte ?? response.number;
  const pointOfSale = response.ptoVenta;
  return {
    // createAfipVoucherAction normalizes the upstream `CAE` field to `cae`,
    // while direct adapter callers may still provide the AFIP spelling.
    cae: cae ?? "",
    number: typeof number === "number" && Number.isInteger(number) && number > 0 ? number : 0,
    pointOfSale: typeof pointOfSale === "number" && Number.isInteger(pointOfSale) && pointOfSale > 0 ? pointOfSale : 0,
    vencimiento: response.vencimiento,
    originalCae: String(original.originalCae),
    originalNumber: Number(original.originalNumber),
    originalPointOfSale: Number(original.originalPointOfSale),
  };
}
