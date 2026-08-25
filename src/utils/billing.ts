import BillTypes from "@/models/billType";
import type BillState from "@/models/BillState";
import type { BillType } from "@/models/billType";

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

/** Builds the payload used by both ARCA and persistence from one type identity. */
export function createBillCheckoutSnapshot(state: BillState, selectedBillType?: string): BillCheckoutSnapshot {
  return {
    ...state,
    billType: normalizeBillType(selectedBillType ?? state.billType),
  };
}
