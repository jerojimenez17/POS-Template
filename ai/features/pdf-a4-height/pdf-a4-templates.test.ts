// @vitest-environment jsdom
/**
 * AC2, AC3, AC4, AC9, AC11, AC13 — pdf-templates A4 contract
 * Must be RED before fix: PDF_STYLES today has no @page A4, no 190mm cap, no 277mm min-height
 * Must be GREEN after fix: PDF_STYLES declares @page A4 portrait 10mm, .pdf-page 277mm, .invoice-container capped to 190mm
 */
import { describe, it, expect } from "vitest";
import { PDF_STYLES, buildPDFHTML, PDF_LAYOUT_SCALE } from "@/lib/print/pdf-templates";
import { buildReceiptBusinessInfo } from "@/lib/print/receipt-data";
import * as fs from "fs";
import * as path from "path";
import { buildPDFHTML as buildPDF } from "@/lib/print/pdf-templates";

// Helpers
function containsCI(h: string, n: string) { return h.toLowerCase().includes(n.toLowerCase()); }
const baseDate = new Date("2026-03-15T12:00:00Z");
const fiscalInfo = {
  razonSocial: "Demo S.R.L.",
  cuit: "30-12345678-9",
  condicionIva: "RESPONSABLE_INSCRIPTO",
  address: "Calle Falsa 123",
  inicioActividades: "2020-01-01",
};

function baseReceipt(overrides: Partial<Parameters<typeof buildPDF>[0]> = {}) {
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
    ...overrides,
  } as Parameters<typeof buildPDF>[0];
}

function countPdfPages(html: string): number {
  return (html.match(/class="pdf-page"/g) || []).length;
}

// ---------------------------------------------------------------------------
// AC2 — @page A4 present in PDF_STYLES
// ---------------------------------------------------------------------------
describe("pdf-templates — AC2 @page A4 portrait 10mm", () => {
  it('PDF_STYLES contains literal "@page"', () => {
    expect(PDF_STYLES).toContain("@page");
  });
  it('PDF_STYLES contains "A4"', () => {
    expect(PDF_STYLES).toContain("A4");
  });
  it('PDF_STYLES contains "portrait"', () => {
    expect(PDF_STYLES.toLowerCase()).toContain("portrait");
  });
  it('PDF_STYLES contains "10mm" margin', () => {
    expect(PDF_STYLES).toContain("10mm");
  });
  it('PDF_STYLES contains "@media print" with @page', () => {
    expect(PDF_STYLES).toContain("@media print");
    // media print block should also contain A4
    const afterMedia = PDF_STYLES.split("@media print")[1] || "";
    expect(afterMedia).toContain("A4");
  });
  it('PDF_STYLES does NOT use size:auto for pdf (no "size: auto" in pdf styles)', () => {
    // BrowserPrint DEFAULT_PAGE_STYLE uses size:auto, but PDF_STYLES must not
    expect(PDF_STYLES).not.toMatch(/size\s*:\s*auto/i);
  });
  it("PDF_STYLES optionally exports PDF_A4_PAGE_STYLE constant containing A4", () => {
    // After fix spec allows PDF_A4_PAGE_STYLE export. We check via file content
    const p = path.resolve(process.cwd(), "src/lib/print/pdf-templates.ts");
    const src = fs.readFileSync(p, "utf8");
    // Either PDF_STYLES already contains @page A4 (above tests) or file exports PDF_A4_PAGE_STYLE
    const hasConstant = src.includes("PDF_A4_PAGE_STYLE");
    const hasAtPageInStyles = src.includes("@page") && src.includes("A4");
    expect(hasAtPageInStyles || hasConstant).toBe(true);
    // If constant exists, it must contain A4 portrait 10mm
    if (hasConstant) {
      expect(src).toMatch(/PDF_A4_PAGE_STYLE[^;]*A4[^;]*portrait[^;]*10mm/i);
    }
  });
});

// ---------------------------------------------------------------------------
// AC3 — .pdf-page occupies A4: min-height 277mm (or 297mm) and width 190mm
// ---------------------------------------------------------------------------
describe("pdf-templates — AC3 .pdf-page A4 dimensions", () => {
  it(".pdf-page has min-height 277mm or 297mm (useful height)", () => {
    // Must contain min-height: 277mm  or  calc(297mm - 20mm)  or  297mm
    const pdfPageRule = (PDF_STYLES.match(/\.pdf-page\s*\{[^}]+\}/i)?.[0] || PDF_STYLES);
    const has277 = pdfPageRule.includes("277mm");
    const has297 = pdfPageRule.includes("297mm");
    expect(has277 || has297).toBe(true);
    // specifically min-height
    expect(pdfPageRule).toMatch(/min-height\s*:\s*[^;]*?(277mm|297mm)/i);
  });
  it(".pdf-page has width 190mm or max-width capped and box-sizing border-box", () => {
    const pdfPageRule = (PDF_STYLES.match(/\.pdf-page\s*\{[^}]+\}/i)?.[0] || PDF_STYLES);
    expect(pdfPageRule).toMatch(/width\s*:\s*[^;]*190mm|190mm/i);
    expect(pdfPageRule.toLowerCase()).toContain("box-sizing");
  });
  it('.pdf-page preserves break-after: page and break-inside: avoid', () => {
    expect(PDF_STYLES).toContain("break-after");
    expect(PDF_STYLES).toMatch(/break-inside\s*:\s*avoid/i);
  });
  it(".pdf-page last element should not force extra blank break (no empty trailing .pdf-page)", () => {
    const html = buildPDFHTML(baseReceipt());
    // BuildPDF today creates 2 .pdf-page for 1 product (table + totals). Last page must contain totals, not be empty
    expect(html).toContain("TOTAL");
    const pages = html.split('class="pdf-page"');
    const lastPage = pages[pages.length - 1] || "";
    expect(lastPage).toContain("TOTAL");
    expect(lastPage.length).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// AC3 — .invoice-container reflects A4 190mm usable width, not 750px alone
// ---------------------------------------------------------------------------
describe("pdf-templates — AC3 .invoice-container A4 cap", () => {
  it(".invoice-container width is capped to 190mm (not only 750px*scale)", () => {
    const containerRule = (PDF_STYLES.match(/\.invoice-container\s*\{[^}]+\}/i)?.[0] || "");
    expect(containerRule).toContain("190mm");
    // Must use min() or max-width 190mm, not just 750px*scale alone
    const hasCap = containerRule.includes("190mm") && (containerRule.includes("min(") || containerRule.includes("max-width") || containerRule.includes("width: 190mm"));
    expect(hasCap).toBe(true);
  });
  it(".invoice-container does not have uncapped width: calc(750px*scale) alone without 190mm", () => {
    const containerRule = (PDF_STYLES.match(/\.invoice-container\s*\{[^}]+\}/i)?.[0] || "");
    // Before fix: "width: calc(750px * var(--pdf-layout-scale))" alone. After fix should include 190mm
    if (containerRule.includes("750px")) {
      expect(containerRule).toContain("190mm");
    } else {
      expect(containerRule).toContain("190mm");
    }
  });
  it("PDF_LAYOUT_SCALE remains 1.3 but applied on A4 base", () => {
    expect(PDF_LAYOUT_SCALE).toBeCloseTo(1.3, 1);
    // Ensure PDF_STYLES references --pdf-layout-scale (scale variable)
    expect(PDF_STYLES).toContain("--pdf-layout-scale");
  });
});

// ---------------------------------------------------------------------------
// AC5 — pagination 18 items
// ---------------------------------------------------------------------------
describe("pdf-templates — AC5 pagination 18 items", () => {
  function products(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      description: `Prod ${i + 1} con nombre largo para probar overflow-wrap`,
      amount: 1,
      unitPrice: 10,
      subtotal: 10,
    }));
  }

  it("1 product => 2 pdf-page blocks (header-table + totals)", () => {
    const html = buildPDFHTML(baseReceipt({ products: products(1) }));
    expect(countPdfPages(html)).toBe(2);
  });
  it("18 products => 2 pdf-page blocks (single table page + totals)", () => {
    const html = buildPDFHTML(baseReceipt({ products: products(18) }));
    expect(countPdfPages(html)).toBe(2);
  });
  it("19 products => 3 pdf-page blocks (18 + 1 + totals)", () => {
    const html = buildPDFHTML(baseReceipt({ products: products(19) }));
    expect(countPdfPages(html)).toBe(3);
  });
  it("36 products => 3 pdf-page blocks (18+18+totals)", () => {
    const html = buildPDFHTML(baseReceipt({ products: products(36) }));
    expect(countPdfPages(html)).toBe(3);
  });
  it("37 products => 4 pdf-page blocks (18+18+1+totals)", () => {
    const html = buildPDFHTML(baseReceipt({ products: products(37) }));
    expect(countPdfPages(html)).toBe(4);
  });
  it("0 products edge => at least 1 pdf-page with empty table + totals (no crash)", () => {
    const html = buildPDFHTML(baseReceipt({ products: [] }));
    expect(countPdfPages(html)).toBeGreaterThanOrEqual(2);
    expect(html).toContain("<table>");
  });

});

// ---------------------------------------------------------------------------
// AC4 — short content still A4: single product HTML still has pdf-page with A4 min-height styles
// ---------------------------------------------------------------------------
describe("pdf-templates — AC4 short content still A4 via CSS", () => {
  it("short content html still contains pdf-page with min-height (so canvas will be A4 height)", () => {
    const html = buildPDFHTML(baseReceipt({ products: [{ description: "Solo uno", amount: 1, unitPrice: 50, subtotal: 50 }] }));
    expect(html).toContain('class="pdf-page"');
    // The html itself declares no inline min-height, but styles do. So we assert styles contain min-height as above
    expect(PDF_STYLES).toMatch(/\.pdf-page[^}]*min-height[^}]*277mm/i);
    const hasMinHeight = PDF_STYLES.includes("277mm") || PDF_STYLES.includes("297mm");
    expect(hasMinHeight).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC6 AC7 AC8 — presupuesto / factura / remito content still A4 + presupuesto-print-fix preserved
// ---------------------------------------------------------------------------
describe("pdf-templates — AC6 AC7 AC8 content + presupuesto-print-fix regression", () => {
  it("AC6 Presupuesto PDF A4 shows Presupuesto no fiscal", () => {
    const receipt = {
      ...baseReceipt({ billType: "Presupuesto", businessInfo: fiscalInfo, cae: undefined }),
      businessName: "Mi Comercio",
      cae: undefined,
      billType: "Presupuesto",
    } as never;
    const html = buildPDFHTML(receipt);
    expect(html).toContain("Presupuesto");
    expect(html).toMatch(/No válido como factura/i);
    expect(html).not.toContain("CUIT:");
    expect(html).not.toContain("CAE:");
    expect(html).not.toContain("Comprobante Autorizado");
  });
  it("AC7 Factura PDF A4 with CAE shows Factura + CAE + A4 styles", () => {
    const cae = { cae: "12345678901234", vencimiento: "2026-12-31", qrData: "qr-data", ptoVenta: 1 };
    const receipt = {
      ...baseReceipt({ billType: "Factura B", businessInfo: fiscalInfo, cae, pointOfSale: 1, invoiceNumber: 23 }),
      billType: "Factura B",
      cae,
    } as never;
    const html = buildPDFHTML(receipt, { pointOfSale: 1, invoiceNumber: 23 });
    expect(html).toContain("Factura B");
    expect(html).toContain("001-0023");
    expect(html).toContain("CUIT:");
    expect(html).toContain("CAE:");
    expect(html).toContain("Comprobante Autorizado");
    expect(containsCI(html, "Factura")).toBe(true);
  });
  it("AC8 Remito PDF A4 shows Remito", () => {
    // remito = not presupuesto, no CAE => documentKind remito
    const receipt = {
      ...baseReceipt({ billType: "Remito", cae: undefined }),
      billType: "Remito",
      cae: undefined,
    } as never;
    const html = buildPDFHTML(receipt);
    expect(html).toContain("Remito");
    expect(html).not.toContain("CAE:");
  });
  it("AC13 no regression previous presupuesto-print-fix: presupuesto hides Pago and Gracias, shows legend; factura shows them", () => {
    const presupuestoHtml = buildPDFHTML(baseReceipt({ billType: "Presupuesto", cae: undefined }) as never);
    const facturaCae = { cae: "12345678901234", vencimiento: "2026-12-31", qrData: "qr", ptoVenta: 1 };
    const facturaHtml = buildPDFHTML(baseReceipt({ billType: "Factura B", cae: facturaCae, businessInfo: fiscalInfo } as never), { pointOfSale: 1, invoiceNumber: 1 });
    expect(presupuestoHtml).not.toContain("Medio de Pago");
    expect(presupuestoHtml).not.toContain("¡Gracias por su compra!");
    expect(presupuestoHtml).toMatch(/No válido como factura/i);
    expect(facturaHtml).toContain("Medio de Pago");
    expect(facturaHtml).toContain("¡Gracias por su compra!");
  });
});

// ---------------------------------------------------------------------------
// AC9 — thermal intact 80mm
// ---------------------------------------------------------------------------
describe("thermal intact — AC9 @page 80mm auto preserved", () => {
  it("BrowserPrint.ts still declares @page 80mm auto for thermal and THERMAL_WIDTH 40", () => {
    const p = path.resolve(process.cwd(), "src/lib/print/BrowserPrint.ts");
    const src = fs.readFileSync(p, "utf8");
    expect(src).toContain("80mm");
    expect(src).toMatch(/@page\s*\{\s*size:\s*80mm\s+auto/i);
    expect(src).toContain("THERMAL_WIDTH");
    // thermal html must not be changed to A4
    expect(src).toMatch(/buildThermalPrintHTML[\s\S]*?80mm/);
    // must NOT contain A4 inside thermal builder (only pdf area may)
    const thermalSection = src.slice(src.indexOf("function buildThermalPrintHTML"), src.indexOf("async function tryFallbackHTMLPrint"));
    expect(thermalSection).not.toMatch(/size:\s*A4/i);
  });
  it("thermal generateThermalReceipt still hides Pago for presupuesto but shows for factura (presupuesto-print-fix intact)", async () => {
    const { generateThermalReceipt } = await import("@/lib/print/BrowserPrint");
    const presupuesto = generateThermalReceipt({
      businessName: "Mi Comercio",
      date: baseDate,
      documentType: "DNI",
      paidMethod: "Efectivo",
      products: [{ description: "A", amount: 1, unitPrice: 10, subtotal: 10 }],
      subtotal: 10,
      total: 10,
      billType: "Presupuesto",
      cae: undefined,
      client: "Cliente",
    } as never);
    const factura = generateThermalReceipt({
      businessName: "Mi Comercio",
      date: baseDate,
      documentType: "DNI",
      paidMethod: "Efectivo",
      products: [{ description: "A", amount: 1, unitPrice: 10, subtotal: 10 }],
      subtotal: 10,
      total: 10,
      billType: "Factura B",
      cae: { cae: "1234", vencimiento: "2026-12-31", qrData: "qr", ptoVenta: 1 },
      businessInfo: fiscalInfo,
    } as never);
    expect(presupuesto).not.toContain("Pago:");
    expect(presupuesto).toMatch(/PRESUPUESTO.*NO VALIDO/i);
    expect(factura).toContain("Pago:");
  });
});

// ---------------------------------------------------------------------------
// AC11 — margin 10mm consistent
// ---------------------------------------------------------------------------
describe("AC11 margin 10mm consistent", () => {
  it('PDF_STYLES @page margin is 10mm', () => {
    expect(PDF_STYLES).toMatch(/@page[^}]*margin\s*:\s*10mm/i);
  });
  it('src/lib/print/BrowserPrint.ts default PDF_A4_PAGE_STYLE should be 10mm (if present)', () => {
    const p = path.resolve(process.cwd(), "src/lib/print/BrowserPrint.ts");
    const src = fs.readFileSync(p, "utf8");
    // After fix, BrowserPrint should select PDF_A4_PAGE_STYLE with 10mm when format a4
    if (src.includes("PDF_A4_PAGE_STYLE") || src.includes("size: A4")) {
      expect(src).toMatch(/A4[^;]*10mm|10mm[^;]*A4/i);
      expect(src).not.toMatch(/@page[^}]*a4[^}]*5mm/i);
    } else {
      // Before fix, this will fail to find A4 page style — intentional RED
      expect(src).toContain("PDF_A4_PAGE_STYLE");
    }
  });
});

// ---------------------------------------------------------------------------
// AC1 supplemental: buildReceiptBusinessInfo preserves presupuesto kind
// ---------------------------------------------------------------------------
describe("receipt-data presupuesto kind preserved for A4", () => {
  it("buildReceiptBusinessInfo for Presupuesto without CAE stays presupuesto with A4", () => {
    const r = buildReceiptBusinessInfo("Mi Comercio", undefined, fiscalInfo as never, "Presupuesto");
    expect(r.documentKind).toBe("presupuesto");
    const html = buildPDFHTML({ ...baseReceipt(), ...r, cae: undefined, billType: "Presupuesto" } as never);
    expect(html).toContain("Presupuesto");
  });
});
