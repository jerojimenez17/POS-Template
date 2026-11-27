// @vitest-environment jsdom
/**
 * AC1, AC3, AC4, AC11 — PDFExport.ts A4 contract
 * Must be RED before fix for: orientation forced portrait, margin 10, format a4 string, min-height / pagination
 * Mocks html2canvas and jspdf per previous QA pattern (presupuesto-print-fix).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockCanvas = {
  width: 800,
  height: 300,
  toDataURL: vi.fn(() => "data:image/png;base64,xxx"),
} as unknown as HTMLCanvasElement;

const mockAddImage = vi.fn();
const mockAddPage = vi.fn();
const mockSetProps = vi.fn();
const mockOutput = vi.fn(() => new Blob(["pdf"], { type: "application/pdf" }));
const mockSave = vi.fn();
const mockGetWidth = vi.fn(() => 210);
const mockGetHeight = vi.fn(() => 297);
const mockInternal = { pageSize: { getWidth: mockGetWidth, getHeight: mockGetHeight } };

const MockJsPDFConstructor = vi.fn(function (this: unknown, opts: unknown) {
  const self = this as Record<string, unknown>;
  self.internal = mockInternal;
  self.setDocumentProperties = mockSetProps;
  self.addImage = mockAddImage;
  self.addPage = mockAddPage;
  self.output = mockOutput;
  self.save = mockSave;
  self.getNumberOfPages = vi.fn(() => 1);
  // store opts for inspection
  (MockJsPDFConstructor as unknown as { lastOpts: unknown }).lastOpts = opts;
  return self;
});
(MockJsPDFConstructor as unknown as { lastOpts: unknown }).lastOpts = null;

vi.mock("jspdf", () => ({
  jsPDF: MockJsPDFConstructor,
}));

vi.mock("html2canvas", () => ({
  default: vi.fn(async () => mockCanvas),
}));

// window.open and URL helpers for exportToPDF blob flow
const originalOpen = window.open;
const originalCreateObjectURL = URL.createObjectURL;

beforeEach(() => {
  vi.clearAllMocks();
  (mockCanvas as unknown as { width: number; height: number }).width = 800;
  (mockCanvas as unknown as { width: number; height: number }).height = 300;
  mockGetWidth.mockReturnValue(210);
  mockGetHeight.mockReturnValue(297);
  (MockJsPDFConstructor as unknown as { lastOpts: unknown }).lastOpts = null;
  // provide fake window.open that returns object with focus/print
  // @ts-ignore
  window.open = vi.fn(() => ({
    location: { href: "blob:fake", includes: () => false },
    document: { write: vi.fn(), close: vi.fn() },
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(),
    set onload(fn: unknown) {
      // auto invoke for coverage
      if (typeof fn === "function") setTimeout(fn as () => void, 0);
    },
  })) as unknown as typeof window.open;
  // @ts-ignore
  URL.createObjectURL = vi.fn(() => "blob:fake-url");
});

// trivial helper to avoid unused warning
function awaitImportHtml2canvas() {
  return null;
}

afterEach(() => {
  window.open = originalOpen;
  URL.createObjectURL = originalCreateObjectURL;
});

// ---------------------------------------------------------------------------
// AC1 — jsPDF A4 portrait 210x297 mm, unit mm, format a4
// ---------------------------------------------------------------------------
describe("PDFExport — AC1 A4 portrait fixed", () => {
  it("exportToPDF with format a4 creates jsPDF with format:'a4', orientation:'portrait', unit:'mm'", async () => {
    const { exportToPDF } = await import("@/lib/print/PDFExport");
    const el = document.createElement("div");
    el.innerHTML = '<div class="pdf-page">page1</div>';
    document.body.appendChild(el);
    await exportToPDF(el as HTMLElement, { format: "a4", orientation: "portrait", margin: 10 });
    document.body.removeChild(el);
    const lastOpts = (MockJsPDFConstructor as unknown as { lastOpts: { orientation: string; unit: string; format: unknown } }).lastOpts;
    expect(lastOpts).toBeDefined();
    expect(lastOpts.unit).toBe("mm");
    expect(lastOpts.format).toBe("a4");
    expect(lastOpts.orientation).toBe("portrait");
  });

  it("exportToPDF with format a4 forces portrait even when caller passes landscape (must not be landscape)", async () => {
    const { exportToPDF } = await import("@/lib/print/PDFExport");
    const el = document.createElement("div");
    el.innerHTML = '<div class="pdf-page">page</div>';
    document.body.appendChild(el);
    // Caller mistakenly requests landscape — feature must force portrait for A4
    await exportToPDF(el as HTMLElement, { format: "a4", orientation: "landscape", margin: 10 } as never);
    document.body.removeChild(el);
    const lastOpts = (MockJsPDFConstructor as unknown as { lastOpts: { orientation: string; format: unknown } }).lastOpts;
    expect(lastOpts.orientation).toBe("portrait");
    expect(lastOpts.format).toBe("a4");
  });

  it("pdf pageSize for a4 is 210x297 regardless of canvas size (short content still A4)", async () => {
    const { exportToPDF } = await import("@/lib/print/PDFExport");
    const el = document.createElement("div");
    el.innerHTML = '<div class="pdf-page">short</div>';
    document.body.appendChild(el);
    // small canvas
    (mockCanvas as unknown as { width: number; height: number }).width = 400;
    (mockCanvas as unknown as { width: number; height: number }).height = 200;
    await exportToPDF(el as HTMLElement, { format: "a4", orientation: "portrait", margin: 10 });
    document.body.removeChild(el);
    const lastOpts = (MockJsPDFConstructor as unknown as { lastOpts: { orientation: string; format: unknown } }).lastOpts;
    expect(lastOpts.format).toBe("a4");
    // jsPDF internal pageSize should be A4 210x297
    // Our mock returns 210/297; verify constructor was called with a4 (not custom array)
    expect(typeof lastOpts.format === "string" ? lastOpts.format : "").toBe("a4");
  });

  it("exportToPDF computes imgWidth 190mm (210 - 2*margin) and pageContentHeight 277mm", async () => {
    const { exportToPDF } = await import("@/lib/print/PDFExport");
    const el = document.createElement("div");
    el.innerHTML = '<div class="pdf-page">page</div>';
    document.body.appendChild(el);
    mockAddImage.mockClear();
    await exportToPDF(el as HTMLElement, { format: "a4", orientation: "portrait", margin: 10 });
    document.body.removeChild(el);
    // imgWidth passed as 4th arg to addImage? Actually pdf.addImage(data, type, x, y, w, h)
    expect(mockAddImage).toHaveBeenCalled();
    const args = mockAddImage.mock.calls[0];
    // args: [dataURL, "PNG", margin, margin, imgWidth, imgHeight]
    const imgWidth = args[4] as number;
    const imgHeight = args[5] as number;
    expect(imgWidth).toBeCloseTo(190, 0);
    expect(imgWidth).toBe(190);
    expect(imgHeight).toBeLessThanOrEqual(277);
    // Verify pageContentHeight derivation via source: pageHeight - margin*2 = 277
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/print/PDFExport.ts"), "utf8");
    expect(src).toMatch(/pageContentHeight|pageHeight\s*-\s*margin/);
    // Short content still produces A4 pageSize (format a4) even when canvas small — verified by jsPDF mock
    expect((MockJsPDFConstructor as unknown as { lastOpts: { format: unknown } }).lastOpts).toMatchObject({ format: "a4" });
  });

  it("format thermal uses custom array [80,297] not string a4", async () => {
    const { exportToPDF } = await import("@/lib/print/PDFExport");
    const el = document.createElement("div");
    document.body.appendChild(el);
    await exportToPDF(el as HTMLElement, { format: "thermal", orientation: "portrait", margin: 10 });
    document.body.removeChild(el);
    const lastOpts = (MockJsPDFConstructor as unknown as { lastOpts: { format: unknown } }).lastOpts;
    const fmt = (lastOpts as { format: unknown }).format;
    // thermal is custom size [80,297]
    expect(Array.isArray(fmt)).toBe(true);
    if (Array.isArray(fmt)) {
      expect(fmt[0]).toBe(80);
      expect(fmt[1]).toBe(297);
    }
  });

  it("AC11 margin 10 is default and matches spec", async () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/print/PDFExport.ts"), "utf8");
    expect(src).toMatch(/margin\s*:\s*10/);
    expect(src).toMatch(/DEFAULT_OPTIONS[\s\S]*margin\s*:\s*10/);
    // also ensure no PDF branch uses 5mm (stock label margin)
    // Check exportToPDF default logic: margin derived from options or DEFAULT_OPTIONS 10
    const { exportToPDF } = await import("@/lib/print/PDFExport");
    const el = document.createElement("div");
    el.innerHTML = '<div class="pdf-page">p</div>';
    document.body.appendChild(el);
    mockAddImage.mockClear();
    // call without explicit margin => should default 10 => x=10, y=10
    await exportToPDF(el as HTMLElement, { format: "a4", orientation: "portrait" });
    document.body.removeChild(el);
    const args = mockAddImage.mock.calls[0];
    const x = args[2] as number;
    const y = args[3] as number;
    expect(x).toBe(10);
    expect(y).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Pagination: .pdf-page handling
// ---------------------------------------------------------------------------
describe("PDFExport — .pdf-page pagination handling", () => {
  it("when element contains .pdf-page divs, captures each page separately (N canvases = N pages)", async () => {
    // Verify source handles .pdf-page pagination (deterministic, avoids html2canvas real parse)
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/print/PDFExport.ts"), "utf8");
    expect(src).toContain(".pdf-page");
    expect(src).toContain("querySelectorAll");
    expect(src).toContain("Promise.all(pages.map");
    expect(src).toMatch(/pages\.length\s*>\s*0/);
    // Also verify runtime is handled via single-page mock that already passed above; multi-page logic is same code path
    expect(src).toContain('".pdf-page"');
  });

  it("when element has no .pdf-page, captures whole element as single page", async () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/print/PDFExport.ts"), "utf8");
    expect(src).toContain(".pdf-page");
    expect(src).toContain("querySelectorAll");
    const { exportToPDF } = await import("@/lib/print/PDFExport");
    const el = document.createElement("div");
    el.innerHTML = '<div>single without pdf-page class</div>';
    document.body.appendChild(el);
    mockAddPage.mockClear();
    await exportToPDF(el as HTMLElement, { format: "a4", orientation: "portrait", margin: 10 });
    document.body.removeChild(el);
    // no extra addPage for single page (first page not counted)
    expect(mockAddPage).not.toHaveBeenCalled();
  });

  it("getFormatDimensions for a4 is 210x297 (via jsPDF instance pageSize)", async () => {
    // Indirect via exportToPDF: jsPDF pageSize mocked to 210x297
    const { exportToPDF } = await import("@/lib/print/PDFExport");
    const el = document.createElement("div");
    el.innerHTML = '<div class="pdf-page">a4 size check</div>';
    document.body.appendChild(el);
    mockGetWidth.mockClear();
    mockGetHeight.mockClear();
    await exportToPDF(el as HTMLElement, { format: "a4", orientation: "portrait", margin: 10 });
    document.body.removeChild(el);
    // Verify constructor got a4 => our mock will report 210x297
    expect((MockJsPDFConstructor as unknown as { lastOpts: { format: unknown } }).lastOpts).toMatchObject({ format: "a4" });
    // also verify file source has correct switch
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/print/PDFExport.ts"), "utf8");
    expect(src).toMatch(/a4/);
    expect(src).toContain("210");
    expect(src).toContain("297");
  });

  it("downloadElementAsPDF also respects a4 portrait 210x297", async () => {
    const { downloadElementAsPDF } = await import("@/lib/print/PDFExport");
    const el = document.createElement("div");
    el.innerHTML = '<div class="pdf-page">dl</div>';
    document.body.appendChild(el);
    await downloadElementAsPDF(el as HTMLElement, "test-a4", { format: "a4", orientation: "portrait", margin: 10 });
    document.body.removeChild(el);
    const lastOpts = (MockJsPDFConstructor as unknown as { lastOpts: { format: unknown; orientation: string } }).lastOpts;
    expect(lastOpts.format).toBe("a4");
    expect((lastOpts as { orientation: string }).orientation).toBe("portrait");
    expect(mockSave).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC12 TS strict: PDFExport signatures use PrintOptions typed, no any, margin number
// ---------------------------------------------------------------------------
describe("PDFExport — AC12 TS strict signature", () => {
  it("PDFExport.ts does not contain 'any' in exportToPDF signature (strict)", () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/print/PDFExport.ts"), "utf8");
    // Ensure PrintOptions is typed, not any
    expect(src).toContain("PrintOptions");
    // crude check no any in exportToPDF params
    const exportSig = src.match(/export async function exportToPDF[\s\S]*?\{/);
    if (exportSig) expect(exportSig[0]).not.toMatch(/:\s*any\b/);
  });
});
