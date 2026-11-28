// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { printThermalReceipt } from "@/lib/print/BrowserPrint";
import type { ThermalReceiptData } from "@/lib/print/BrowserPrint";

const VERIFIED_URL = "https://www.afip.gob.ar/fe/qr/?p=c3ludGhldGljLXRoZXJtYWwtcGF5bG9hZA==";

describe("thermal invoice QR image generation", () => {
  it("embeds an actual generated PNG image and retains CAE in fallback thermal output", async () => {
    const write = vi.fn();
    const close = vi.fn();
    const printWindow = {
      document: { write, close },
      close: vi.fn(),
    } as unknown as Window;
    vi.stubGlobal("window", { open: vi.fn(() => printWindow) });

    const invoice: ThermalReceiptData = {
      businessName: "Comercio de prueba",
      date: new Date("2026-04-09T12:00:00.000Z"),
      documentType: "DNI",
      billType: "Factura B",
      paidMethod: "Tarjeta",
      products: [],
      subtotal: 2750,
      total: 2750,
      invoiceNumber: 345,
      pointOfSale: 12,
      cae: { cae: "12345678901234", vencimiento: "20261231", qrValue: VERIFIED_URL },
    };

    await expect(printThermalReceipt(invoice, false)).resolves.toBe(true);

    expect(write).toHaveBeenCalledTimes(1);
    const html = String(write.mock.calls[0]?.[0]);
    expect(html).toContain("12345678901234");
    expect(html).toMatch(/<img src="data:image\/png;base64,[A-Za-z0-9+/]+=*" alt="QR"\s*\/>/);
    const imageData = html.match(/<img src="data:image\/png;base64,([A-Za-z0-9+/]+=*)" alt="QR"/);
    expect(imageData?.[1]).toBeTruthy();
    const png = Buffer.from(imageData?.[1] ?? "", "base64");
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(html).not.toContain("<img src=\"null\"");
  });

  it("does not include an image when a resolved QR value is explicitly absent", async () => {
    const write = vi.fn();
    const printWindow = {
      document: { write: write, close: vi.fn() },
      close: vi.fn(),
    } as unknown as Window;
    vi.stubGlobal("window", { open: vi.fn(() => printWindow) });

    await printThermalReceipt({
      businessName: "Comercio de prueba",
      date: new Date("2026-04-09T12:00:00.000Z"),
      documentType: "DNI",
      billType: "Factura B",
      paidMethod: "Tarjeta",
      products: [],
      subtotal: 2750,
      total: 2750,
      cae: { cae: "12345678901234", vencimiento: "20261231", qrValue: null },
    }, false);

    const html = String(write.mock.calls[0]?.[0]);
    expect(html).toContain("12345678901234");
    expect(html).not.toContain('alt="QR"');
  });
});
