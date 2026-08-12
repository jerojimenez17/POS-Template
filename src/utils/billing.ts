import BillTypes from "@/models/billType";

/**
 * Returns the default bill type based on the business's IVA condition.
 *
 * - RESPONSABLE_INSCRIPTO → "Factura B"
 * - MONOTRIBUTO → "Factura C"
 * - null / undefined / unrecognized → "Factura C" (fallback)
 */
export function getDefaultBillType(
  condicionIva?: string | null,
): string {
  if (!condicionIva) {
    return BillTypes.C;
  }
  const normalized = condicionIva.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized === "RESPONSABLE_INSCRIPTO") {
    return BillTypes.B;
  }
  return BillTypes.C;
}
