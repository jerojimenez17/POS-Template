import { afterEach, describe, expect, it, vi } from "vitest";

const { qrToDataUrl, qzPrint, qzIsActive } = vi.hoisted(() => ({
  qrToDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,qr"),
  qzPrint: vi.fn().mockResolvedValue(undefined),
  qzIsActive: vi.fn().mockReturnValue(true),
}));

vi.mock("qrcode", () => ({ default: { toDataURL: qrToDataUrl } }));
vi.mock("qz-tray", () => ({
  default: {
    websocket: { isActive: qzIsActive, connect: vi.fn() },
    printers: { getDefault: vi.fn().mockResolvedValue("thermal") },
    configs: { create: vi.fn().mockReturnValue({}) },
    print: qzPrint,
  },
}));
import {
  formatInvoiceNumberFull,
  getBillTypeDisplay,
} from "../../../src/lib/utils/bill-type";
import {
  buildReceiptBusinessInfo,
  getDocumentPrintKind,
} from "../../../src/lib/print/receipt-data";
import { generateThermalReceipt, printThermalReceipt } from "../../../src/lib/print/BrowserPrint";
import { buildPDFHTML } from "../../../src/lib/print/pdf-templates";

const baseReceipt = {
  businessName: "Comercio Demo",
  date: new Date("2026-01-01T12:00:00Z"),
  documentType: "DNI",
  paidMethod: "Efectivo",
  products: [{ description: "Producto preservado", amount: 2, unitPrice: 100, subtotal: 200 }],
  subtotal: 200,
  total: 200,
};

const officialReceipt = {
  ...baseReceipt,
  billType: "Factura C",
  pointOfSale: 1,
  invoiceNumber: 23,
  cae: { cae: " 123 ", vencimiento: "31/12/2026" },
  businessInfo: {
    razonSocial: "Comercio Demo S.R.L.",
    cuit: "30-12345678-9",
    condicionIva: "RESPONSABLE_INSCRIPTO",
    address: "Calle Actual 123",
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  qrToDataUrl.mockClear();
  qzPrint.mockClear();
});

describe("invoice number display — shared formatting contract", () => {
  it("formats separate point of sale and receipt number as 001-0023", () => {
    expect(formatInvoiceNumberFull(23, 1)).toBe("001-0023");
  });

  it("interprets a seven-digit historical value as point of sale plus receipt", () => {
    expect(formatInvoiceNumberFull("0010023" as unknown as number)).toBe("001-0023");
  });

  it.each([0, null, undefined, Number.NaN, "", "   ", "abc"]) (
    "omits absent or invalid value %p without a placeholder",
    (value) => {
      expect(formatInvoiceNumberFull(value as unknown as number)).toBe("");
    },
  );

  it("does not reinterpret a legacy twelve-digit value as 4+8", () => {
    expect(formatInvoiceNumberFull("000100000023" as unknown as number)).toBe("");
  });
});

describe("CAE is the only official-document discriminator", () => {
  it.each(["123", " 123 "]) ("recognizes non-empty trimmed CAE %p", (cae) => {
    expect(getDocumentPrintKind(cae)).toBe("official-invoice");
    expect(getBillTypeDisplay("4", cae)).toBe("Factura B");
  });

  it.each(["", "   ", null, undefined]) ("classifies CAE %p as remito", (cae) => {
    expect(getDocumentPrintKind(cae)).toBe("remito");
    expect(getBillTypeDisplay("4", cae)).toBe("Comprobante");
    expect(buildReceiptBusinessInfo("Comercio Demo", cae).documentKind).toBe("remito");
  });
});

describe("thermal ESC/POS and fallback HTML", () => {
  it("uses the same padded number in ESC/POS and keeps fiscal data/products", () => {
    const output = generateThermalReceipt(officialReceipt);

    expect(output).toContain("Nro:");
    expect(output).toContain("001-0023");
    expect(output).toContain("CAE:");
    expect(output).toContain("123");
    expect(output).toContain("Producto preservado");
  });

  it("does not print invoice identification or fiscal data for a remito", () => {
    const output = generateThermalReceipt({
      ...baseReceipt,
      pointOfSale: 1,
      invoiceNumber: 23,
      cae: { cae: "   ", vencimiento: "", qrData: "stale-qr" },
    });

    expect(output).not.toContain("Nro:");
    expect(output).not.toContain("CAE:");
    expect(output).not.toContain("COMPROBANTE AUTORIZADO");
    expect(output).toContain("Tipo:");
  });

  it("omits the fiscal number when CAE exists but point of sale is absent", () => {
    const output = generateThermalReceipt({
      ...officialReceipt,
      pointOfSale: undefined,
      cae: { ...officialReceipt.cae, ptoVenta: undefined },
    });

    expect(output).not.toContain("Nro:");
    expect(output).toContain("CAE:");
  });

  it("renders the same identification in the fallback thermal HTML", async () => {
    const printWindow = { document: { write: vi.fn(), close: vi.fn() } };
    vi.spyOn(window, "open").mockReturnValue(printWindow as unknown as Window);

    await printThermalReceipt(officialReceipt, false);

    const html = printWindow.document.write.mock.calls[0]?.[0] as string;
    expect(html).toContain("Nro:");
    expect(html).toContain("001-0023");
    expect(html).toContain("CAE:");
    expect(html).toContain("Producto preservado");
  });

  it("does not generate or render QR for an empty CAE, including QZ Tray", async () => {
    const printWindow = { document: { write: vi.fn(), close: vi.fn() } };
    vi.spyOn(window, "open").mockReturnValue(printWindow as unknown as Window);
    const data = {
      ...officialReceipt,
      pointOfSale: undefined,
      cae: { cae: "   ", vencimiento: "", qrData: "  " },
    };

    await printThermalReceipt(data, false);
    expect(qrToDataUrl).not.toHaveBeenCalled();
    expect(printWindow.document.write.mock.calls[0]?.[0]).not.toContain('<div class="qr-container">');

    await printThermalReceipt(data, true);
    expect(qrToDataUrl).not.toHaveBeenCalled();
    expect(qzPrint).toHaveBeenCalledTimes(1);
    expect(qzPrint.mock.calls[0]?.[1]).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "raw", format: "image" }),
    ]));
  });
});

describe("PDF and printable identification", () => {
  it("shows the official number and CAE while preserving product and totals", () => {
    const html = buildPDFHTML(officialReceipt, { invoiceNumber: 23 });

    expect(html).toContain("N° 001-0023");
    expect(html).toContain("CAE:");
    expect(html).toContain("123");
    expect(html).toContain("Producto preservado");
    expect(html).toContain("$200.00");
  });

  it("omits invoice number and fiscal block for a remito even with stale number/QR data", () => {
    const html = buildPDFHTML(
      { ...baseReceipt, pointOfSale: 1, cae: { cae: "", vencimiento: "", qrData: "stale-qr" } },
      { invoiceNumber: 23 },
    );

    expect(html).not.toContain("N°");
    expect(html).not.toContain("CAE:");
    expect(html).not.toContain("Comprobante Autorizado");
    expect(html).toContain("Producto preservado");
  });
});
