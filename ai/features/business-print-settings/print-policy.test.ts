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
  ])("prints only businessName for a remito (%s)", (_label, cae) => {
    const receipt = { ...baseReceipt, businessInfo: fiscalInfo, ...cae };
    const thermal = generateThermalReceipt(receipt);
    const pdf = buildPDFHTML(receipt);

    for (const output of [thermal, pdf]) {
      expect(output).toContain("Comercio Demo");
      expect(output).not.toContain("Comercio Demo S.R.L.");
      expect(output).not.toContain("30-12345678-9");
      expect(output).not.toContain("RESPONSABLE");
      expect(output).not.toContain("Calle Actual 123");
      expect(output).not.toContain("Datos del Establecimiento");
    }
  });

  it("does not print an empty or stale address", () => {
    const receipt = { ...baseReceipt, businessInfo: { ...fiscalInfo, address: null }, cae: { cae: "CAE-1", vencimiento: "" } };
    expect(generateThermalReceipt(receipt)).not.toContain("Calle Actual 123");
    expect(buildPDFHTML(receipt)).not.toContain("Calle Actual 123");
  });
});
