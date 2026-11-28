import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  report: vi.fn(),
  toDataURL: vi.fn(),
  qzActive: vi.fn(),
  qzConnect: vi.fn(),
  getDefaultPrinter: vi.fn(),
  qzPrint: vi.fn(),
}));

vi.mock("@/actions/sales/qr-print", () => ({ reportQrRendererOutcomeAction: mocks.report }));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.toDataURL } }));
vi.mock("qz-tray", () => ({
  default: {
    websocket: { isActive: mocks.qzActive, connect: mocks.qzConnect },
    printers: { getDefault: mocks.getDefaultPrinter },
    configs: { create: vi.fn(() => ({ printer: "synthetic" })) },
    print: mocks.qzPrint,
  },
}));

import { printThermalReceipt } from "@/lib/print/BrowserPrint";

const QR_URL = "https://private.invalid/?p=qr-payload-private";
const CAE = "CAE-PRIVATE-SENTINEL";
const CUIT = "CUIT-PRIVATE-SENTINEL";
const ORDER_ID = "ORDER-PRIVATE-SENTINEL";
const TOKEN = "TOKEN-PRIVATE-SENTINEL";

function receipt() {
  return {
    businessName: "Synthetic business",
    date: new Date("2026-01-01T12:00:00.000Z"),
    documentType: "DNI",
    billType: "Factura B",
    paidMethod: "Tarjeta",
    products: [],
    subtotal: 10,
    total: 10,
    cae: { cae: CAE, vencimiento: "20261231", qrValue: QR_URL },
  };
}

function expectOnlyEnumReports() {
  for (const call of mocks.report.mock.calls) {
    expect(call).toHaveLength(1);
    expect(Object.keys(call[0] as object).sort()).toEqual(["outcome", "renderer"]);
  }
  const requests = JSON.stringify(mocks.report.mock.calls);
  expect(requests).not.toMatch(/https?:\/\/|payload|qrValue|orderId|tenant|token|CAE|CUIT/i);
  for (const sentinel of [QR_URL, CAE, CUIT, ORDER_ID, TOKEN]) expect(requests).not.toContain(sentinel);
}

function stringifyLogValue(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message} ${value.stack ?? ""}`;
  if (Array.isArray(value)) return value.map(stringifyLogValue).join(" ");
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).map(([key, nested]) => `${key} ${stringifyLogValue(nested)}`).join(" ");
  }
  return String(value ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.report.mockResolvedValue({ success: true });
  mocks.toDataURL.mockResolvedValue("data:image/png;base64,iVBORw0KGgo=");
  mocks.qzActive.mockReturnValue(true);
  mocks.qzConnect.mockResolvedValue(undefined);
  mocks.getDefaultPrinter.mockResolvedValue("Synthetic printer");
  mocks.qzPrint.mockResolvedValue(undefined);
  vi.spyOn(window, "open").mockReturnValue({
    document: { write: vi.fn(), close: vi.fn() },
    close: vi.fn(),
  } as unknown as Window);
});

describe("thermal and QZ outcome boundaries", () => {
  it("reports thermal-html generated only after the QR encoder returns non-empty PNG data", async () => {
    let resolvePng: ((dataUrl: string) => void) | undefined;
    mocks.toDataURL.mockImplementation(() => new Promise<string>((resolve) => { resolvePng = resolve; }));
    const printing = printThermalReceipt(receipt(), false);

    await vi.waitFor(() => expect(mocks.toDataURL).toHaveBeenCalled());
    expect(mocks.report).not.toHaveBeenCalled();
    resolvePng?.("data:image/png;base64,iVBORw0KGgo=");
    await expect(printing).resolves.toBe(true);

    expect(mocks.report).toHaveBeenCalledWith({ renderer: "thermal-html", outcome: "generated" });
    expectOnlyEnumReports();
  });

  it("reports thermal-html failed when PNG generation fails and never claims generated", async () => {
    mocks.toDataURL.mockRejectedValue(new Error(`private failure ${QR_URL} ${CAE}`));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(printThermalReceipt(receipt(), false)).resolves.toBe(true);

      expect(mocks.report).toHaveBeenCalledWith({ renderer: "thermal-html", outcome: "failed" });
      expect(mocks.report).not.toHaveBeenCalledWith({ renderer: "thermal-html", outcome: "generated" });
      expectOnlyEnumReports();
      expect(JSON.stringify(error.mock.calls)).not.toMatch(/private\.invalid|qr-payload-private|CAE-PRIVATE/);
    } finally {
      error.mockRestore();
    }
  });

  it("reports QZ submitted only after the QZ print handoff resolves successfully", async () => {
    let resolveHandoff: (() => void) | undefined;
    mocks.qzPrint.mockImplementation(() => new Promise<void>((resolve) => { resolveHandoff = resolve; }));
    const printing = printThermalReceipt(receipt(), true);

    await vi.waitFor(() => expect(mocks.qzPrint).toHaveBeenCalled());
    expect(mocks.report).not.toHaveBeenCalledWith({ renderer: "qz", outcome: "submitted" });
    resolveHandoff?.();
    await expect(printing).resolves.toBe(true);

    expect(mocks.report).toHaveBeenCalledWith({ renderer: "qz", outcome: "submitted" });
    expectOnlyEnumReports();
  });

  it("does not report QZ submitted when the handoff rejects", async () => {
    mocks.qzPrint.mockRejectedValue(new Error(`private handoff ${QR_URL} ${TOKEN}`));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await expect(printThermalReceipt(receipt(), true)).resolves.toBe(true);

      expect(stringifyLogValue(warn.mock.calls)).not.toMatch(/private\.invalid|qr-payload-private|CAE-PRIVATE|TOKEN-PRIVATE/);
      expect(mocks.report).not.toHaveBeenCalledWith({ renderer: "qz", outcome: "submitted" });
      expect(mocks.report).toHaveBeenCalledWith({ renderer: "qz", outcome: "failed" });
      expectOnlyEnumReports();
    } finally {
      warn.mockRestore();
    }
  });
});
