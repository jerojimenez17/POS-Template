import { describe, expect, it } from "vitest";
import { generateThermalReceipt } from "../../../src/lib/print/BrowserPrint";
import { buildPDFHTML } from "../../../src/lib/print/pdf-templates";

const baseReceipt = {
  businessName: "Comercio Demo",
  date: new Date("2026-01-01T12:00:00Z"),
  documentType: "DNI",
  paidMethod: "Efectivo",
  products: [{ description: "Producto", amount: 1, unitPrice: 100, subtotal: 100 }],
  subtotal: 100,
  total: 100,
};

const fiscalInfo = {
  razonSocial: "Comercio Demo S.R.L.",
  cuit: "30-12345678-9",
  condicionIva: "RESPONSABLE_INSCRIPTO",
  inicioActividades: "2020-01-01",
  address: "Calle Actual 123",
};

describe("business print DTO policy", () => {
  it("renders every available fiscal field for an official invoice with a non-empty CAE", () => {
    const receipt = {
      ...baseReceipt,
      businessInfo: fiscalInfo,
      cae: { cae: "12345678901234", vencimiento: "31/12/2026" },
    };

    const thermal = generateThermalReceipt(receipt);
    const pdf = buildPDFHTML(receipt);

    for (const output of [thermal, pdf]) {
      expect(output).toContain("Comercio Demo");
      expect(output).toContain("Comercio Demo S.R.L.");
      expect(output).toContain("30-12345678-9");
      expect(output).toContain("RESPONSABLE");
      expect(output).toContain("Calle Actual 123");
      expect(output).toContain("12345678901234");
    }
  });

  it.each([
    ["empty CAE", { cae: { cae: "", vencimiento: "" } }],
    ["missing CAE", {}],
  ])("prints only businessName on thermal for a remito; PDF keeps the always-on Establecimiento card (%s)", (_label, cae) => {
    const receipt = { ...baseReceipt, businessInfo: fiscalInfo, ...cae };
    const thermal = generateThermalReceipt(receipt);
    const pdf = buildPDFHTML(receipt);

    // Thermal: strictly businessName (documentKind gating).
    expect(thermal).toContain("Comercio Demo");
    expect(thermal).not.toContain("Comercio Demo S.R.L.");
    expect(thermal).not.toContain("30-12345678-9");
    expect(thermal).not.toContain("RESPONSABLE");
    expect(thermal).not.toContain("Calle Actual 123");
    expect(thermal).not.toContain("12345678901234");

    // PDF (report-C §4, ours kept): the Establecimiento card renders
    // unconditionally, so CUIT/Cond. IVA/address may appear; the AFIP-only
    // pieces (razonSocial company line + CAE section) stay invoice-gated.
    expect(pdf).toContain("Comercio Demo");
    expect(pdf).not.toContain("Comercio Demo S.R.L.");
    expect(pdf).not.toContain("12345678901234");
  });

  it("does not print an empty or stale address", () => {
    const receipt = { ...baseReceipt, businessInfo: { ...fiscalInfo, address: null }, cae: { cae: "CAE-1", vencimiento: "" } };
    expect(generateThermalReceipt(receipt)).not.toContain("Calle Actual 123");
    expect(buildPDFHTML(receipt)).not.toContain("Calle Actual 123");
  });
});
