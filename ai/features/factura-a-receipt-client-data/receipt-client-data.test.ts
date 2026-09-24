import { describe, expect, it, vi } from "vitest";
import { buildPDFHTML } from "@/lib/print/pdf-templates";
import { generateThermalReceipt, printThermalReceipt } from "@/lib/print/BrowserPrint";

const authorizedReceipt = {
  businessName: "Mi comercio",
  businessInfo: { cuit: "30-99999999-1", condicionIva: "Responsable Inscripto" },
  date: new Date("2026-01-02T12:00:00.000Z"),
  billType: "Factura A",
  documentType: "CUIT",
  client: "ACME <script>",
  clientIvaCondition: "responsable_inscripto",
  clientDocumentNumber: "01234567890",
  paidMethod: "Efectivo",
  products: [{ description: "Producto", amount: 1, unitPrice: 100, subtotal: 100 }],
  subtotal: 100,
  total: 100,
  cae: { cae: "12345678901234", vencimiento: "2026-02-01" },
};

describe("Factura A client data in receipt renderers", () => {
  it("renders client name, normalized IVA, and exact CUIT separately from business tax data in PDF", () => {
    const html = buildPDFHTML(authorizedReceipt);

    expect(html).toContain("Datos del Cliente");
    expect(html).toContain("ACME &lt;script&gt;");
    expect(html).toContain("responsable inscripto");
    expect(html).toContain("CUIT:");
    expect(html).toContain("01234567890");
    expect(html).toContain("30-99999999-1");
    expect(html.indexOf("Datos del Cliente")).toBeLessThan(html.indexOf("Datos del Establecimiento"));
  });

  it("keeps client condition when the document type is absent and never renders empty rows", () => {
    const html = buildPDFHTML({
      ...authorizedReceipt,
      documentType: "",
      clientDocumentNumber: "",
      clientIvaCondition: "consumidor_final",
    });

    expect(html).toContain("Cond. IVA:");
    expect(html).not.toMatch(/undefined|null|NaN/);
    expect(html).not.toContain('class="info-label">:</span>');
  });

  it("does not invent a DNI label when an identifier has no document type", async () => {
    const receipt = {
      ...authorizedReceipt,
      documentType: "",
      clientDocumentNumber: "0012345678",
    };

    const pdf = buildPDFHTML(receipt);
    const thermal = generateThermalReceipt(receipt);

    expect(pdf).not.toMatch(/DNI\s*:/);
    expect(thermal).not.toMatch(/DNI\s*:/);

    const written: string[] = [];
    vi.stubGlobal("window", { open: () => ({
      document: { write: (html: string) => written.push(html), close: () => undefined },
    }) });
    await printThermalReceipt(receipt, false);

    expect(written[0]).not.toMatch(/DNI\s*:/);
    vi.unstubAllGlobals();
  });

  it("preserves leading zeroes and renders thermal client fields in stable order", () => {
    const text = generateThermalReceipt(authorizedReceipt);

    expect(text).toContain("01234567890");
    expect(text).toMatch(/CUIT:\s+01234567890/);
    expect(text.indexOf("ACME")).toBeLessThan(text.indexOf("01234567890"));
    expect(text.indexOf("01234567890")).toBeLessThan(text.indexOf("Cond.IVA"));
    expect(text).not.toContain("<script>");
  });

  it("uses the same client content in the browser thermal fallback", async () => {
    const written: string[] = [];
    const printWindow = {
      document: {
        write: (html: string) => written.push(html),
        close: () => undefined,
      },
    };
    vi.stubGlobal("window", { open: () => printWindow });

    await printThermalReceipt(authorizedReceipt, false);

    expect(written).toHaveLength(1);
    expect(written[0]).toContain("01234567890");
    expect(written[0]).toContain("responsable inscripto");
    expect(written[0]).toContain("ACME &lt;script&gt;");
    vi.unstubAllGlobals();
  });

  it("does not add client tax rows for non-Factura-A documents", () => {
    const html = buildPDFHTML({
      ...authorizedReceipt,
      billType: "Remito",
      cae: undefined,
    });

    expect(html).toContain("Remito");
    expect(html).not.toContain("COMPROBANTE AUTORIZADO");
    expect(html).toContain("$100.00");
  });
});
