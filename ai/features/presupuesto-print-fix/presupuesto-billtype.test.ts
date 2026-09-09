// @vitest-environment jsdom
/**
 * AC1, AC5, AC3/AC4, AC12 — getBillTypeDisplay / normalizeBillType / receipt-data guards
 * These tests MUST FAIL on current codebase (bug: Presupuesto prints as Remito)
 * and PASS after fix (priority guard for Presupuesto before CAE check).
 */
import { describe, it, expect } from "vitest";
import { getBillTypeDisplay, normalizeBillType } from "@/lib/utils/bill-type";
import { getDocumentPrintKind, buildReceiptBusinessInfo } from "@/lib/print/receipt-data";
import { createBillCheckoutSnapshot } from "@/utils/billing";
import type BillState from "@/models/BillState";

// ---------------------------------------------------------------------------
// AC1 + AC5 — Presupuesto priority over CAE / isRemito
// ---------------------------------------------------------------------------
describe("getBillTypeDisplay — AC1 + AC5 Presupuesto priority", () => {
  it('AC1: getBillTypeDisplay("Presupuesto", null, true) => "Presupuesto" (not Remito)', () => {
    expect(getBillTypeDisplay("Presupuesto", null, true)).toBe("Presupuesto");
  });

  it('AC1: getBillTypeDisplay("Presupuesto", "", false) => "Presupuesto"', () => {
    expect(getBillTypeDisplay("Presupuesto", "", false)).toBe("Presupuesto");
  });

  it('AC1: getBillTypeDisplay("Presupuesto", " 123 ", true) => "Presupuesto" even with CAE', () => {
    // presupuesto is never a fiscal invoice, even if a stray CAE string is present
    expect(getBillTypeDisplay("Presupuesto", " 123 ", true)).toBe("Presupuesto");
  });

  it('AC1: whitespace-trimmed " Presupuesto " still maps to Presupuesto', () => {
    expect(getBillTypeDisplay(" Presupuesto ", null, true)).toBe("Presupuesto");
  });

  it('AC1: presupuesto with CAE and isRemito false stays Presupuesto', () => {
    expect(getBillTypeDisplay("Presupuesto", "99999999999999", false)).toBe("Presupuesto");
  });
});

// ---------------------------------------------------------------------------
// AC5 — exhaustive priority matrix
// ---------------------------------------------------------------------------
describe("getBillTypeDisplay — AC5 priority matrix", () => {
  it('returns Presupuesto before evaluating cae/isRemito', () => {
    // All combos must return Presupuesto when billType is Presupuesto
    expect(getBillTypeDisplay("Presupuesto", null, true)).toBe("Presupuesto");
    expect(getBillTypeDisplay("Presupuesto", null, false)).toBe("Presupuesto");
    expect(getBillTypeDisplay("Presupuesto", undefined, true)).toBe("Presupuesto");
    expect(getBillTypeDisplay("Presupuesto", "   ", true)).toBe("Presupuesto");
    expect(getBillTypeDisplay("Presupuesto", "CAE123", false)).toBe("Presupuesto");
  });
});

// ---------------------------------------------------------------------------
// AC3 / AC4 / AC12 — regression: Remito, Factura, Comprobante paths unchanged
// ---------------------------------------------------------------------------
describe("getBillTypeDisplay — AC3 AC4 AC12 regressions", () => {
  it('AC3: Remito without CAE => "Remito"', () => {
    expect(getBillTypeDisplay(null, null, true)).toBe("Remito");
    expect(getBillTypeDisplay(undefined, "", true)).toBe("Remito");
    expect(getBillTypeDisplay("", null, true)).toBe("Remito");
  });

  it('AC3: Comprobante fallback without CAE and isRemito false', () => {
    expect(getBillTypeDisplay(null, null, false)).toBe("Comprobante");
    expect(getBillTypeDisplay(undefined, undefined, false)).toBe("Comprobante");
    expect(getBillTypeDisplay("", "   ", false)).toBe("Comprobante");
  });

  it('AC4: Factura with CAE resolves via normalizeBillType', () => {
    expect(getBillTypeDisplay("Factura B", "12345678901234", false)).toBe("Factura B");
    expect(getBillTypeDisplay("Factura C", " 123 ", true)).toBe("Factura C");
    expect(getBillTypeDisplay("1", "999", false)).toBe("Factura A"); // numeric ARCA code
  });

  it('AC4: legacy sale with CAE but no billType falls back to Factura C', () => {
    expect(getBillTypeDisplay(null, "123", false)).toBe("Factura C");
    expect(getBillTypeDisplay("", "123", false)).toBe("Factura C");
  });

  it('AC12: orders without billType and without CAE remain Remito/Comprobante, not Presupuesto', () => {
    expect(getBillTypeDisplay(undefined, null, true)).not.toBe("Presupuesto");
    expect(getBillTypeDisplay(null, null, true)).toBe("Remito");
    expect(getBillTypeDisplay(null, null, false)).toBe("Comprobante");
  });
});

// ---------------------------------------------------------------------------
// normalizeBillType preservation (used by createBillCheckoutSnapshot)
// ---------------------------------------------------------------------------
describe("normalizeBillType / createBillCheckoutSnapshot — Presupuesto preservation", () => {
  it('normalizeBillType preserves "Presupuesto" literal', () => {
    // typed via string to avoid narrowing, runtime must preserve
    expect(normalizeBillType("Presupuesto" as unknown as string)).toBe("Presupuesto");
  });

  it('normalizeBillType preserves "Remito" literal', () => {
    expect(normalizeBillType("Remito" as unknown as string)).toBe("Remito");
  });

  it("createBillCheckoutSnapshot with Presupuesto keeps billType Presupuesto", () => {
    const base: BillState = {
      id: "s1",
      products: [{ id: "p1", description: "Prod", salePrice: 100, amount: 1 } as never],
      total: 100,
      totalWithDiscount: 100,
      seller: "seller@test",
      discount: 0,
      date: new Date("2026-03-01T10:00:00Z"),
      typeDocument: "DNI",
      documentNumber: 0,
      IVACondition: "Consumidor Final",
      twoMethods: false,
      billType: "Factura B",
    };
    const snap = createBillCheckoutSnapshot(base, "Presupuesto");
    expect(snap.billType).toBe("Presupuesto");
  });

  it("snapshot billType survives cloning (products, CAE, date are cloned)", () => {
    const base: BillState = {
      id: "s2",
      products: [{ id: "p1", description: "Prod", salePrice: 50, amount: 2 } as never],
      total: 100,
      totalWithDiscount: 90,
      seller: "seller",
      discount: 10,
      date: new Date("2026-03-01T10:00:00Z"),
      typeDocument: "DNI",
      documentNumber: 0,
      IVACondition: "Consumidor Final",
      twoMethods: false,
      billType: "Presupuesto",
      CAE: { CAE: "", nroComprobante: 0, vencimiento: "", qrData: "" },
    };
    const snap = createBillCheckoutSnapshot(base, "Presupuesto");
    base.products.length = 0;
    expect(snap.products).toHaveLength(1);
    expect(snap.billType).toBe("Presupuesto");
  });
});

// ---------------------------------------------------------------------------
// receipt-data — DocumentPrintKind extension (AC6 optional)
// ---------------------------------------------------------------------------
describe("receipt-data — AC6 / R2 DocumentPrintKind presupuesto", () => {
  it('getDocumentPrintKind(null) stays "remito" for plain remito', () => {
    expect(getDocumentPrintKind(null)).toBe("remito");
    expect(getDocumentPrintKind(undefined)).toBe("remito");
    expect(getDocumentPrintKind("   ")).toBe("remito");
  });

  it('getDocumentPrintKind with CAE stays "official-invoice"', () => {
    expect(getDocumentPrintKind("12345678901234")).toBe("official-invoice");
    expect(getDocumentPrintKind(" 123 ")).toBe("official-invoice");
  });

  it('AC6/R2: buildReceiptBusinessInfo for presupuesto should NOT be "official-invoice" and should NOT expose fiscal info', () => {
    // If extended, prescription without CAE must not be official-invoice.
    // This test will FAIL if implementation still classifies presupuesto as remito without distinguishing,
    // and PASS when budget is treated as its own kind or at minimum not official-invoice.
    const info = {
      razonSocial: "Demo S.R.L.",
      cuit: "30-12345678-9",
      condicionIva: "RESPONSABLE_INSCRIPTO",
      address: "Calle 123",
      inicioActividades: "2020-01-01",
    };
    // Call with presupuesto billType if API supports second param; otherwise assert remito behavior
    const asAny = getDocumentPrintKind as unknown as (cae: string | null | undefined, billType?: string | null) => string;
    const kind = asAny.length >= 2 ? asAny(null, "Presupuesto") : getDocumentPrintKind(null);
    // presupuesto must NOT be official-invoice
    expect(kind).not.toBe("official-invoice");
    // If kind is presupuesto, businessInfo must be stripped
    const receipt = (buildReceiptBusinessInfo as unknown as (name: string, cae: string | null | undefined, businessInfo?: unknown, billType?: string | null) => { documentKind: string; businessInfo?: unknown })(
      "Mi Comercio",
      null,
      info,
      "Presupuesto",
    );
    if (receipt.documentKind === "presupuesto") {
      expect(receipt.businessInfo).toBeUndefined();
    } else {
      // fallback: for remito kind, businessInfo also stripped (current behavior) — at least not official
      expect(receipt.documentKind).not.toBe("official-invoice");
      expect(receipt.businessInfo).toBeUndefined();
    }
  });

  it('if DocumentPrintKind is extended to "presupuesto", presupuesto without CAE yields presupuesto', () => {
    // This is a strict future-proof assertion: will FAIL now (returns remito) and PASS after R2 extension.
    // We keep it as a failing contract for the fix; if team chooses minimal fix (only getBillTypeDisplay),
    // this test can be updated to expect "remito" — but SPEC recommends extension.
    const fn = getDocumentPrintKind as unknown as (cae: string | null | undefined, billType?: string | null) => string;
    // Only assert if function accepts billType param; if not, we force failure to drive implementation.
    // Using any to bypass TS, we expect presupuesto.
    const result = fn(null, "Presupuesto");
    // On current code fn(null) returns remito and ignores second arg, so this fails.
    // After fix it should return presupuesto.
    expect(result).toBe("presupuesto");
  });
});
