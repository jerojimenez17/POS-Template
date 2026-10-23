import BillTypes from "@/models/billType";
import Product from "@/models/Product";
import type BillState from "@/models/BillState";
import type { BillType } from "@/models/billType";
import type { FiscalBreakdownV1 } from "@/services/afip/credit-note";

/**
 * Returns the default bill type based on the business's IVA condition.
 *
 * - RESPONSABLE_INSCRIPTO → "Factura B"
 * - MONOTRIBUTO → "Factura C"
 * - null / undefined / unrecognized → "Factura C" (fallback)
 */
export function getDefaultBillType(
  condicionIva?: string | null,
): BillType {
  if (!condicionIva) {
    return BillTypes.C;
  }
  const normalized = condicionIva.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized === "RESPONSABLE_INSCRIPTO") {
    return BillTypes.B;
  }
  return BillTypes.C;
}

const INVOICE_TYPES: readonly BillType[] = [BillTypes.A, BillTypes.B, BillTypes.C];

/** Returns a supported bill type, never an empty or undefined checkout value. */
export function normalizeBillType(value: string | null | undefined, fallback: BillType = BillTypes.C): BillType {
  if (value && (INVOICE_TYPES as readonly string[]).includes(value)) {
    return value as BillType;
  }
  if (value === "Remito" || value === "Presupuesto") return value;
  return fallback;
}

export function getArcaBillTypeCode(value: string | null | undefined): 1 | 6 | 11 {
  switch (normalizeBillType(value)) {
    case BillTypes.A:
      return 1;
    case BillTypes.B:
      return 6;
    default:
      return 11;
  }
}

export interface BillCheckoutSnapshot extends BillState {
  billType: BillType;
}

export interface AfipInvoiceProductDTO {
  id: string;
  code: string;
  description: string;
  price: number;
  salePrice: number;
  amount: number;
}

/** A deliberately small, serializable payload for the AFIP Server Action. */
export interface AfipInvoiceDTO {
  id: string;
  seller: string;
  typeDocument: string;
  IVACondition: string;
  twoMethods: boolean;
  secondPaidMethod?: string;
  totalSecondMethod?: number | null;
  entrega?: number;
  pago?: boolean;
  billType: "Factura A" | "Factura B" | "Factura C";
  paidMethod?: string;
  clientId?: string;
  client?: string;
  clientIvaCondition?: string;
  clientDocumentNumber?: string;
  discount: number;
  documentNumber: number;
  total: number;
  totalWithDiscount: number;
  date: string;
  ptoVenta?: number;
  products: AfipInvoiceProductDTO[];
  /** Internal-only fields used by the existing trusted credit-note pathway. */
  nroAsociado?: number;
  ptoVentaAsociado?: number;
  caeAsociado?: string;
  CbtesAsoc?: Array<Record<string, unknown>>;
  fiscalBreakdown?: FiscalBreakdownV1;
}

/**
 * Resolves the total used by the AFIP HTTP billState projection. A positive
 * explicitly-provided discounted total wins; otherwise a positive discount is
 * applied to the raw total with the same whole-peso rounding as the request.
 */
export function getEffectiveAfipInvoiceTotal(
  invoice: Pick<AfipInvoiceDTO, "discount" | "total" | "totalWithDiscount">,
): number {
  const providedTotalWithDiscount = Number(invoice.totalWithDiscount) || 0;
  const rawTotal = Number(invoice.total) || 0;
  const discount = Number(invoice.discount) || 0;

  return providedTotalWithDiscount > 0
    ? providedTotalWithDiscount
    : discount > 0 ? Math.round(rawTotal * (1 - discount / 100)) : rawTotal;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

function ownValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor)) throw new Error("La factura contiene un campo no válido");
  return descriptor.value;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = ownValue(record, key);
  if (typeof value !== "string") throw new Error("La factura contiene datos incompletos o no válidos");
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = ownValue(record, key);
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("La factura contiene datos no válidos");
  return value;
}

function requiredFiniteNumber(record: Record<string, unknown>, key: string): number {
  const value = ownValue(record, key);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("La factura contiene importes no válidos");
  }
  return value;
}

function normalizedDate(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(Date.prototype.getTime.call(value))) throw new Error("La fecha de la factura no es válida");
    return Date.prototype.toISOString.call(value);
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
    throw new Error("La fecha de la factura no es válida");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("La fecha de la factura no es válida");
  const normalized = parsed.toISOString();
  if (normalized.slice(0, 10) !== value.slice(0, 10)) throw new Error("La fecha de la factura no es válida");
  return normalized;
}

/** Projects a Product instance or plain product to its six AFIP-approved fields. */
export function projectAfipInvoiceProduct(value: unknown): AfipInvoiceProductDTO {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("La factura contiene un producto no válido");
  }
  const prototype = Object.getPrototypeOf(value);
  // Product is a UI class with own data fields. Its nested supplier and other
  // class fields are intentionally never read or copied here.
  if (prototype !== Object.prototype && prototype !== null && prototype !== Product.prototype) {
    throw new Error("La factura contiene un producto no válido");
  }
  const product = value as Record<string, unknown>;
  return {
    id: requiredString(product, "id"),
    code: requiredString(product, "code"),
    description: requiredString(product, "description"),
    price: requiredFiniteNumber(product, "price"),
    salePrice: requiredFiniteNumber(product, "salePrice"),
    amount: requiredFiniteNumber(product, "amount"),
  };
}

function projectProductArray(value: unknown): AfipInvoiceProductDTO[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error("La lista de productos no es válida");
  }
  const products: AfipInvoiceProductDTO[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) throw new Error("La lista de productos no es válida");
    products.push(projectAfipInvoiceProduct(descriptor.value));
  }
  return products;
}

/** Re-validates and reconstructs an AFIP invoice payload from untrusted data. */
export function normalizeAfipInvoiceDTO(value: unknown): AfipInvoiceDTO {
  if (!isPlainRecord(value)) throw new Error("Los datos de la factura no son válidos");
  const billType = ownValue(value, "billType") ?? "Factura B";
  if (billType !== "Factura A" && billType !== "Factura B" && billType !== "Factura C") {
    throw new Error("El tipo de factura no es válido");
  }
  const products = projectProductArray(ownValue(value, "products"));
  const discountValue = ownValue(value, "discount");
  const discount = typeof discountValue === "number" && Number.isFinite(discountValue) ? discountValue : 0;
  const rawTotal = requiredFiniteNumber(value, "total");
  const rawTotalWithDiscount = ownValue(value, "totalWithDiscount");
  const totalWithDiscount = typeof rawTotalWithDiscount === "number" && Number.isFinite(rawTotalWithDiscount)
    ? rawTotalWithDiscount
    : discount > 0 ? Math.round(rawTotal * (1 - discount / 100)) : rawTotal;
  const rawDocumentNumber = ownValue(value, "documentNumber");
  const documentNumber = typeof rawDocumentNumber === "number"
    && Number.isSafeInteger(rawDocumentNumber) && rawDocumentNumber >= 0
    ? rawDocumentNumber
    : 0;
  const rawPtoVenta = ownValue(value, "ptoVenta");
  if (rawPtoVenta !== undefined && (typeof rawPtoVenta !== "number" || !Number.isFinite(rawPtoVenta))) {
    throw new Error("El punto de venta no es válido");
  }
  const rawTwoMethods = ownValue(value, "twoMethods");
  if (typeof rawTwoMethods !== "boolean") throw new Error("La forma de pago no es válida");
  const rawTotalSecondMethod = ownValue(value, "totalSecondMethod");
  if (rawTotalSecondMethod !== undefined && rawTotalSecondMethod !== null
    && (typeof rawTotalSecondMethod !== "number" || !Number.isFinite(rawTotalSecondMethod))) {
    throw new Error("La forma de pago no es válida");
  }
  const rawEntrega = ownValue(value, "entrega");
  if (rawEntrega !== undefined && (typeof rawEntrega !== "number" || !Number.isFinite(rawEntrega))) {
    throw new Error("La forma de pago no es válida");
  }
  const rawPago = ownValue(value, "pago");
  if (rawPago !== undefined && typeof rawPago !== "boolean") throw new Error("La forma de pago no es válida");

  return {
    id: requiredString(value, "id"),
    seller: requiredString(value, "seller"),
    typeDocument: requiredString(value, "typeDocument"),
    IVACondition: requiredString(value, "IVACondition"),
    twoMethods: rawTwoMethods,
    ...(optionalString(value, "secondPaidMethod") !== undefined
      ? { secondPaidMethod: optionalString(value, "secondPaidMethod") } : {}),
    ...(rawTotalSecondMethod !== undefined ? { totalSecondMethod: rawTotalSecondMethod as number | null } : {}),
    ...(rawEntrega !== undefined ? { entrega: rawEntrega as number } : {}),
    ...(rawPago !== undefined ? { pago: rawPago } : {}),
    billType,
    ...(optionalString(value, "paidMethod") !== undefined ? { paidMethod: optionalString(value, "paidMethod") } : {}),
    ...(optionalString(value, "clientId") !== undefined ? { clientId: optionalString(value, "clientId") } : {}),
    ...(optionalString(value, "client") !== undefined ? { client: optionalString(value, "client") } : {}),
    ...(optionalString(value, "clientIvaCondition") !== undefined
      ? { clientIvaCondition: optionalString(value, "clientIvaCondition") } : {}),
    ...(optionalString(value, "clientDocumentNumber") !== undefined
      ? { clientDocumentNumber: optionalString(value, "clientDocumentNumber") } : {}),
    discount,
    documentNumber,
    total: rawTotal,
    totalWithDiscount,
    date: normalizedDate(ownValue(value, "date")),
    ...(rawPtoVenta !== undefined ? { ptoVenta: rawPtoVenta as number } : {}),
    products,
  };
}

/** Client-side AFIP boundary projection; does not retain UI model references. */
export function createAfipInvoiceDTO(state: unknown, selectedBillType?: string): AfipInvoiceDTO {
  if (!isPlainRecord(state)) throw new Error("Los datos de la factura no son válidos");
  const projected: Record<string, unknown> = {};
  for (const key of [
    "id", "seller", "typeDocument", "IVACondition", "twoMethods", "secondPaidMethod",
    "totalSecondMethod", "entrega", "pago", "billType", "paidMethod", "clientId", "client",
    "clientIvaCondition", "clientDocumentNumber", "discount", "documentNumber", "total",
    "totalWithDiscount", "date", "ptoVenta", "products",
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(state, key);
    if (!descriptor) continue;
    if (!("value" in descriptor)) throw new Error("La factura contiene un campo no válido");
    projected[key] = descriptor.value;
  }
  if (selectedBillType !== undefined) projected.billType = selectedBillType;
  return normalizeAfipInvoiceDTO(projected);
}

/** Safely strips the untrusted envelope before server-side domain validation. */
export function projectAfipInvoiceInput(value: unknown): Partial<AfipInvoiceDTO> {
  if (!isPlainRecord(value)) throw new Error("Los datos de la factura no son válidos");
  const projected: Record<string, unknown> = {};
  for (const key of [
    "id", "seller", "typeDocument", "IVACondition", "twoMethods", "secondPaidMethod",
    "totalSecondMethod", "entrega", "pago", "billType", "paidMethod", "clientId", "client",
    "clientIvaCondition", "clientDocumentNumber", "discount", "documentNumber", "total",
    "totalWithDiscount", "date", "ptoVenta", "products",
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (!("value" in descriptor)) throw new Error("La factura contiene un campo no válido");
    const fieldValue: unknown = descriptor.value;
    if (key === "products") {
      projected.products = projectProductArray(fieldValue);
    } else if (key === "date") {
      projected.date = normalizedDate(fieldValue);
    } else if (fieldValue === null || fieldValue === undefined || typeof fieldValue === "string"
      || typeof fieldValue === "boolean" || (typeof fieldValue === "number" && Number.isFinite(fieldValue))) {
      projected[key] = fieldValue;
    } else {
      throw new Error("La factura contiene un campo no válido");
    }
  }
  return projected;
}

/** Preserves the full checkout/print snapshot semantics for non-AFIP flows. */
export function createBillStateSnapshot(state: BillState, selectedBillType?: string): BillCheckoutSnapshot {
  return {
    ...state,
    products: state.products.map((product) => ({ ...product })),
    CAE: state.CAE ? { ...state.CAE } : undefined,
    date: new Date(state.date),
    billType: normalizeBillType(selectedBillType ?? state.billType),
  };
}

/** Plain checkout snapshot retained for older AFIP boundary callers. */
export function createBillCheckoutSnapshot(
  state: BillState,
  selectedBillType?: string,
): BillCheckoutSnapshot {
  const billType = normalizeBillType(selectedBillType ?? state.billType);
  const hasCompleteAfipProducts = state.products.every((product) =>
    typeof product.id === "string"
    && typeof product.code === "string"
    && typeof product.description === "string"
    && typeof product.price === "number"
    && typeof product.salePrice === "number"
    && typeof product.amount === "number");
  if ((billType === BillTypes.A || billType === BillTypes.B || billType === BillTypes.C) && hasCompleteAfipProducts) {
    // Compatibility for callers that use this helper at the AFIP boundary;
    // the regular persistence/print path uses createBillStateSnapshot.
    return createAfipInvoiceDTO(state, billType) as unknown as BillCheckoutSnapshot;
  }
  return createBillStateSnapshot(state, billType);
}
