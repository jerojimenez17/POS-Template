// @vitest-environment node
/**
 * Unit tests for getDefaultBillType() utility.
 *
 * This function maps a business IVA condition to the default bill type:
 *   - RESPONSABLE_INSCRIPTO → "Factura B"
 *   - MONOTRIBUTO → "Factura C"
 *   - null / undefined → "Factura C" (fallback)
 *
 * TDD: These tests will FAIL until src/utils/billing.ts is created.
 */
import { describe, it, expect } from "vitest";
import { getDefaultBillType } from "@/utils/billing";
import BillTypes from "@/models/billType";

describe("getDefaultBillType", () => {
  // -----------------------------------------------------------------------
  // AC-02: Responsable Inscripto business defaults to Factura B
  // -----------------------------------------------------------------------
  it("returns Factura B when condicionIva is RESPONSABLE_INSCRIPTO", () => {
    expect(getDefaultBillType("RESPONSABLE_INSCRIPTO")).toBe(BillTypes.B);
  });

  it("returns 'Factura B' string when condicionIva is RESPONSABLE_INSCRIPTO", () => {
    expect(getDefaultBillType("RESPONSABLE_INSCRIPTO")).toBe("Factura B");
  });

  // -----------------------------------------------------------------------
  // AC-01: Monotributo business defaults to Factura C
  // -----------------------------------------------------------------------
  it("returns Factura C when condicionIva is MONOTRIBUTO", () => {
    expect(getDefaultBillType("MONOTRIBUTO")).toBe(BillTypes.C);
  });

  it("returns 'Factura C' string when condicionIva is MONOTRIBUTO", () => {
    expect(getDefaultBillType("MONOTRIBUTO")).toBe("Factura C");
  });

  // -----------------------------------------------------------------------
  // AC-06: Fallback to Factura C when business data unavailable
  // -----------------------------------------------------------------------
  it("returns Factura C when condicionIva is null (fallback)", () => {
    expect(getDefaultBillType(null)).toBe(BillTypes.C);
  });

  it("returns Factura C when condicionIva is undefined (fallback)", () => {
    expect(getDefaultBillType(undefined)).toBe(BillTypes.C);
  });

  it("returns Factura C when called with no arguments (fallback)", () => {
    expect(getDefaultBillType()).toBe(BillTypes.C);
  });

  it("returns Factura C for any unrecognized value (fallback)", () => {
    expect(getDefaultBillType("OTRO")).toBe(BillTypes.C);
    expect(getDefaultBillType("")).toBe(BillTypes.C);
  });

  // -----------------------------------------------------------------------
  // Return type consistency
  // -----------------------------------------------------------------------
  it("always returns a BillTypes enum value", () => {
    const ri = getDefaultBillType("RESPONSABLE_INSCRIPTO");
    const mono = getDefaultBillType("MONOTRIBUTO");
    const fallback = getDefaultBillType(null);

    // All results should be one of the valid BillTypes values
    const validTypes = Object.values(BillTypes);
    expect(validTypes).toContain(ri);
    expect(validTypes).toContain(mono);
    expect(validTypes).toContain(fallback);
  });
});
