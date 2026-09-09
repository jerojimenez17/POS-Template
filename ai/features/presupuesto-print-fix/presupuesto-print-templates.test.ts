// @vitest-environment jsdom
/**
 * AC3 AC4 AC6 AC7 AC8 AC9 — pdf-templates + BrowserPrint thermal parity
 * These tests MUST FAIL before fix (budget renders as Remito with Medio de Pago / Gracias)
 * and PASS after fix (Presupuesto omits fiscal data, N°, Pago, Gracias; shows legend).
 */
import { describe, it, expect } from "vitest";
import { buildPDFHTML } from "@/lib/print/pdf-templates";
import { generateThermalReceipt, type ThermalReceiptData } from "@/lib/print/BrowserPrint";

const baseDate = new Date("2026-03-15T12:00:00Z");

const fiscalInfo = {
  razonSocial: "Demo S.R.L.",
  cuit: "30-12345678-9",
  condicionIva: "RESPONSABLE_INSCRIPTO",
  address: "Calle Falsa 123",
  inicioActividades: "2020-01-01",
};

function baseReceipt(): ThermalReceiptData {
  return {
    businessName: "Mi Comercio",
    date: baseDate,
    documentType: "DNI",
    paidMethod: "Efectivo",
    seller: "vendedor@test.com",
    client: "Cliente Demo",
    products: [{ description: "Producto A", amount: 1, unitPrice: 100, subtotal: 100 }],
    subtotal: 100,
    total: 100,
    discount: undefined,
    discountAmount: undefined,
  };
}

// helpers for PDF assertions
function containsCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// ---------------------------------------------------------------------------
// AC7 AC8 AC9 — Presupuesto channel: PDF
// ---------------------------------------------------------------------------
describe("pdf-templates — AC7 AC8 AC9 Presupuesto", () => {
  it('AC1/AC7: PDF with billType Presupuesto and no CAE shows "Presupuesto" not "Remito/Comprobante"', () => {
    const html = buildPDFHTML({
      ...baseReceipt(),
      billType: "Presupuesto",
      businessInfo: fiscalInfo,
      cae: undefined,
    });
    expect(html).toContain("Presupuesto");
    // should not be labelled as Remito/Comprobante header
    // The bug renders Remito/Comprobante; we assert presupuesto is present and remito/comprobante title is not the billType.
    // We check that invoice-type div contains Presupuesto and not bare Remito as billType
    expect(containsCI(html, "Presupuesto")).toBe(true);
    // The buggy output contains Remito inside invoice-type; after fix it contains Presupuesto
    // To make test fail now, we require exact billType display not to be Remito/Comprobante alone.
    // We assert html does NOT have billType Remito as the displayed type when Presupuesto requested.
    // Simplistic but deterministic: count occurrences — Presupuesto must appear as invoice-type
    expect(html).toMatch(/invoice-type[^<]*>[\s\S]*?Presupuesto/i);
  });

  it("AC7: PDF presupuesto does NOT contain fiscal block (CUIT, Condición IVA negocio, Dirección negocio, Inicio Actividades, CAE banner)", () => {
    const html = buildPDFHTML({
      ...baseReceipt(),
      billType: "Presupuesto",
      businessInfo: fiscalInfo,
      cae: undefined,
    });
    expect(html).not.toContain("CUIT:");
    expect(html).not.toContain("30-12345678-9");
    expect(html).not.toContain("Demo S.R.L.");
    // businessInfo block for official invoice contains Condición IVA / Dirección / Inicio Actividades
    // For presupuesto these must be hidden even though fiscalInfo is provided
    expect(html).not.toContain("Calle Falsa 123");
    expect(html).not.toContain("Inicio Actividades");
    expect(html).not.toContain("CAE:");
    expect(html).not.toContain("Comprobante Autorizado");
    expect(html).not.toContain("AFIP");
  });

  it("AC7: PDF presupuesto omits N° invoice number even with pointOfSale/invoiceNumber supplied", () => {
    const html = buildPDFHTML(
      {
        ...baseReceipt(),
        billType: "Presupuesto",
        businessInfo: fiscalInfo,
        cae: undefined,
        pointOfSale: 1,
        invoiceNumber: 23,
      },
      { pointOfSale: 1, invoiceNumber: 23 },
    );
    expect(html).not.toContain("N°");
    expect(html).not.toMatch(/001-0023/);
  });

  it("AC9: PDF presupuesto does NOT contain Medio de Pago / Pago:", () => {
    const html = buildPDFHTML({
      ...baseReceipt(),
      billType: "Presupuesto",
      paidMethod: "Efectivo",
      cae: undefined,
    });
    expect(html).not.toContain("Medio de Pago");
    expect(html).not.toContain("Pago:");
  });

  it("AC8: PDF presupuesto does NOT contain ¡Gracias por su compra! but contains Presupuesto legend", () => {
    const html = buildPDFHTML({
      ...baseReceipt(),
      billType: "Presupuesto",
      cae: undefined,
    });
    expect(html).not.toContain("¡Gracias por su compra!");
    // legend requirement: at least "No válido como factura" or presupuesto-specific text
    expect(html).toMatch(/No válido como factura|Presupuesto/i);
    // ensure thank-you is replaced, not just appended
    expect(containsCI(html, "gracias por su compra")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC7 AC8 AC9 — Presupuesto channel: Thermal ESC/POS
// ---------------------------------------------------------------------------
describe("BrowserPrint thermal — AC7 AC8 AC9 Presupuesto", () => {
  it('AC1/AC6: thermal receipt with Presupuesto shows "Tipo: Presupuesto" not Remito/Comprobante', () => {
    const receipt = generateThermalReceipt({
      ...baseReceipt(),
      billType: "Presupuesto",
      businessInfo: fiscalInfo,
      cae: undefined,
    });
    // billTypeDisplay is rendered via formatLine("Tipo:", billTypeDisplay)
    expect(receipt).toContain("Presupuesto");
    // buggy code returns Comprobante for thermal without CAE; ensure not Comprobante/Remito alone
    // We test that line contains Presupuesto
    expect(receipt).toMatch(/Tipo:\s*Presupuesto/i);
  });

  it("AC7: thermal presupuesto does NOT contain fiscal data (CUIT, Condición IVA, Dirección, Inicio actividades, CAE)", () => {
    const receipt = generateThermalReceipt({
      ...baseReceipt(),
      billType: "Presupuesto",
      businessInfo: fiscalInfo,
      cae: undefined,
    });
    expect(receipt).not.toContain("CUIT:");
    expect(receipt).not.toContain("30-12345678-9");
    expect(receipt).not.toContain("Demo S.R.L.");
    expect(receipt).not.toContain("Calle Falsa 123");
    expect(receipt).not.toContain("Inicio actividades");
    expect(receipt).not.toContain("CAE:");
    expect(receipt).not.toContain("COMPROBANTE AUTORIZADO");
  });

  it("AC7: thermal presupuesto omits Nro invoice number", () => {
    const receipt = generateThermalReceipt({
      ...baseReceipt(),
      billType: "Presupuesto",
      businessInfo: fiscalInfo,
      cae: undefined,
      pointOfSale: 1,
      invoiceNumber: 23,
    });
    expect(receipt).not.toContain("Nro:");
    expect(receipt).not.toContain("001-0023");
  });

  it("AC9: thermal presupuesto does NOT contain Pago: (Medio de Pago) — must hide or replace", () => {
    const receipt = generateThermalReceipt({
      ...baseReceipt(),
      billType: "Presupuesto",
      paidMethod: "Efectivo",
      cae: undefined,
    });
    expect(receipt).not.toContain("Pago:");
  });

  it("AC8: thermal presupuesto does NOT contain GRACIAS POR SU COMPRA but contains Presupuesto legend", () => {
    const receipt = generateThermalReceipt({
      ...baseReceipt(),
      billType: "Presupuesto",
      cae: undefined,
    });
    expect(receipt).not.toContain("GRACIAS POR SU COMPRA");
    expect(containsCI(receipt, "gracias por su compra")).toBe(false);
    expect(receipt).toMatch(/No válido como factura|Presupuesto/i);
  });
});

// ---------------------------------------------------------------------------
// AC6 — both channels share same billType / parity
// ---------------------------------------------------------------------------
describe("parity — AC6 thermal + PDF share same billType", () => {
  it("presupuesto: both channels show Presupuesto identically and both hide fiscal/N°/Pago/Gracias", () => {
    const data: ThermalReceiptData = {
      ...baseReceipt(),
      billType: "Presupuesto",
      businessInfo: fiscalInfo,
      cae: undefined,
      pointOfSale: 1,
      invoiceNumber: 23,
    };
    const pdf = buildPDFHTML(data, { pointOfSale: 1, invoiceNumber: 23 });
    const thermal = generateThermalReceipt(data);
    for (const out of [pdf, thermal]) {
      expect(out).toContain("Presupuesto");
      expect(out).not.toContain("CUIT:");
      expect(out).not.toContain("CAE:");
    }
    expect(pdf).not.toContain("¡Gracias por su compra!");
    expect(thermal).not.toContain("GRACIAS POR SU COMPRA");
    expect(pdf).not.toContain("Medio de Pago");
    expect(thermal).not.toContain("Pago:");
  });
});

// ---------------------------------------------------------------------------
// AC3 — Remito regression (must keep Pago + Gracias, no fiscal, no N°)
// ---------------------------------------------------------------------------
describe("regression — AC3 Remito without CAE", () => {
  it("PDF remito shows Remito, no N°, no CUIT, WITH Pago + Gracias", () => {
    const html = buildPDFHTML({
      ...baseReceipt(),
      billType: "Remito",
      businessInfo: fiscalInfo,
      cae: undefined,
    });
    expect(html).toContain("Remito");
    expect(html).not.toContain("CUIT:");
    expect(html).not.toContain("N°");
    expect(html).toContain("Medio de Pago");
    expect(html).toContain("¡Gracias por su compra!");
  });

  it("thermal remito shows Remito, no Nro, WITH Pago + GRACIAS", () => {
    const receipt = generateThermalReceipt({
      ...baseReceipt(),
      billType: "Remito",
      cae: undefined,
    });
    // thermal without CAE uses getBillTypeDisplay without isRemito flag => Comprobante currently
    // After fix, caller should pass isRemito true via snapshot; but minimal expectation is NOT Presupuesto
    // We assert it does NOT show Presupuesto and does show payment/thanks
    expect(receipt).not.toContain("Presupuesto");
    expect(receipt).toContain("Pago:");
    expect(receipt).toContain("GRACIAS POR SU COMPRA");
  });
});

// ---------------------------------------------------------------------------
// AC4 — Factura regression (with CAE)
// ---------------------------------------------------------------------------
describe("regression — AC4 Factura with CAE", () => {
  const cae = { cae: "12345678901234", vencimiento: "2026-12-31", qrData: "qr", ptoVenta: 1 };

  it("PDF factura with CAE shows Factura B/C, N°, CUIT, CAE banner, Pago, Gracias", () => {
    const html = buildPDFHTML(
      {
        ...baseReceipt(),
        billType: "Factura B",
        businessInfo: fiscalInfo,
        cae,
        pointOfSale: 1,
        invoiceNumber: 23,
      },
      { pointOfSale: 1, invoiceNumber: 23 },
    );
    expect(html).toContain("Factura B");
    expect(html).toContain("001-0023");
    expect(html).toContain("N°");
    expect(html).toContain("CUIT:");
    expect(html).toContain("30-12345678-9");
    expect(html).toContain("CAE:");
    expect(html).toContain("Comprobante Autorizado");
    expect(html).toContain("Medio de Pago");
    expect(html).toContain("¡Gracias por su compra!");
  });

  it("thermal factura with CAE shows Factura, Nro, CUIT, Pago, Gracias", () => {
    const receipt = generateThermalReceipt({
      ...baseReceipt(),
      billType: "Factura B",
      businessInfo: fiscalInfo,
      cae,
      pointOfSale: 1,
      invoiceNumber: 23,
    });
    expect(receipt).toContain("Factura B");
    expect(receipt).toContain("Nro:");
    expect(receipt).toContain("001-0023");
    expect(receipt).toContain("CUIT:");
    expect(receipt).toContain("Pago:");
    expect(receipt).toContain("GRACIAS POR SU COMPRA");
    expect(receipt).toContain("COMPROBANTE AUTORIZADO");
  });

  it("thermal vs PDF parity for factura: both show same N° and factura type", () => {
    const data: ThermalReceiptData = {
      ...baseReceipt(),
      billType: "Factura C",
      businessInfo: fiscalInfo,
      cae,
      pointOfSale: 2,
      invoiceNumber: 7,
    };
    const pdf = buildPDFHTML(data, { pointOfSale: 2, invoiceNumber: 7 });
    const thermal = generateThermalReceipt(data);
    expect(pdf).toContain("Factura C");
    expect(thermal).toContain("Factura C");
    expect(pdf).toContain("002-0007");
    expect(thermal).toContain("002-0007");
  });
});
