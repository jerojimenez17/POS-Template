import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QRCode from "qrcode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrintableTable from "@/components/Billing/PrintableTable";
import PrintOptionsPopover from "@/components/Billing/PrintOptionsPopover";
import { BillContext } from "@/context/BillContext";
import type BillState from "@/models/BillState";
import type CAE from "@/models/CAE";
import { captureConsoleCalls, expectNoBrowserQrDiagnostics } from "./qr-telemetry-test-helpers";

const mocks = vi.hoisted(() => ({
  resolveQr: vi.fn(),
  issueAfip: vi.fn(),
  printThermalReceipt: vi.fn().mockResolvedValue(true),
  exportToPDF: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/actions/sales/qr-print", () => ({ resolveOrderQrPrintDtoAction: mocks.resolveQr }));
vi.mock("@/actions/afip", () => ({ createAfipVoucherAction: mocks.issueAfip }));
vi.mock("@/actions/business", () => ({
  getBusinessBillingInfoAction: vi.fn().mockResolvedValue({
    razonSocial: "Comercio de prueba",
    cuit: "30712345678",
    condicionIva: "Responsable Inscripto",
  }),
}));
vi.mock("@/lib/print", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/print")>();
  return {
    ...actual,
    printThermalReceipt: mocks.printThermalReceipt,
    exportToPDF: mocks.exportToPDF,
  };
});
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "qr-test-font", variable: "--qr-test-font" }) }));

const VERIFIED_URL = "https://www.afip.gob.ar/fe/qr/?p=c3ludGhldGljLWludm9pY2UtcGF5bG9hZA==";
const POISONED_URL = "https://attacker.invalid/qr?p=client";
const LEGACY_RAW = "historical-raw-preserved-byte-for-byte +/=";
const qrToStringSpy = vi.spyOn(QRCode, "toString");

function makeCae(): CAE {
  return {
    CAE: "12345678901234",
    vencimiento: "20261231",
    nroComprobante: 345,
    ptoVenta: 12,
    qrData: "untrusted-client-raw",
    qrUrl: POISONED_URL,
    requestDate: "1999-01-01",
  } as CAE;
}

function makeInvoice(orderId = "persisted-immediate-qr-order") {
  return {
    id: orderId,
    products: [],
    total: 2750,
    totalWithDiscount: 2750,
    seller: "Synthetic QA seller",
    discount: 0,
    date: new Date("2026-04-09T12:00:00.000Z"),
    typeDocument: "DNI",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    clientIvaCondition: "Consumidor Final",
    twoMethods: false,
    billType: "Factura B",
    ptoVenta: 12,
    CAE: makeCae(),
  } as unknown as BillState;
}

function renderImmediateInvoice(printMode: "thermal" | "pdf" = "pdf", orderId?: string) {
  const state = makeInvoice(orderId);
  const context = {
    BillState: state,
    dispatch: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    printMode,
    qzTrayEnabled: false,
  };
  const makeUi = (printTrigger: number) => (
    <BillContext.Provider value={context as never}>
      <PrintableTable
        printTrigger={printTrigger}
        className=""
        handleClose={vi.fn()}
        session={null}
        externalState={state}
      />
    </BillContext.Provider>
  );
  const view = render(makeUi(0));
  return { ...view, triggerPrint: () => view.rerender(makeUi(1)) };
}

function decodedSvg(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/svg\+xml;base64,(.+)$/);
  if (!match?.[1]) throw new Error("Expected a base64 SVG image data URL");
  return atob(match[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  qrToStringSpy.mockClear();
  vi.spyOn(window, "open").mockReturnValue(null);
  mocks.resolveQr.mockResolvedValue({ qrValue: VERIFIED_URL, qrKind: "verified-url" });
  mocks.printThermalReceipt.mockResolvedValue(true);
  mocks.exportToPDF.mockResolvedValue(true);
});

describe("ordinary invoice output from the tenant-resolved QR DTO", () => {
  it("creates a real visible SVG and embeds a generated SVG image in the immediate PDF", async () => {
    const { container, triggerPrint } = renderImmediateInvoice("pdf");

    await waitFor(() => expect(mocks.resolveQr).toHaveBeenCalledWith("persisted-immediate-qr-order"));
    const visibleSvg = await waitFor(() => {
      const svg = container.querySelector(".print-visible svg");
      expect(svg).not.toBeNull();
      return svg as SVGSVGElement;
    });
    expect(visibleSvg.querySelectorAll("path, rect").length).toBeGreaterThan(0);
    expect(visibleSvg.outerHTML).toContain("viewBox");
    expect(screen.getByText("12345678901234")).toBeInTheDocument();

    triggerPrint();

    await waitFor(() => expect(mocks.exportToPDF).toHaveBeenCalledTimes(1));
    const pdfRoot = mocks.exportToPDF.mock.calls[0]?.[0] as HTMLElement;
    const qrImage = pdfRoot.querySelector<HTMLImageElement>('img[alt="QR"]');
    expect(qrImage?.src).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(decodedSvg(qrImage?.getAttribute("src") ?? "")).toContain("<svg");
    expect(pdfRoot.textContent).toContain("12345678901234");
    expect(pdfRoot.innerHTML).not.toContain(POISONED_URL);
    expect(qrToStringSpy).toHaveBeenCalledWith(
      VERIFIED_URL,
      expect.objectContaining({ type: "svg", margin: 0, width: 60 }),
    );
  });

  it("completes the immediate PDF with CAE but no QR image for a none DTO", async () => {
    mocks.resolveQr.mockResolvedValue({ qrValue: null, qrKind: "none" });
    const { container, triggerPrint } = renderImmediateInvoice("pdf");

    await waitFor(() => expect(mocks.resolveQr).toHaveBeenCalledWith("persisted-immediate-qr-order"));
    await waitFor(() => expect(screen.getByText("12345678901234")).toBeInTheDocument());
    expect(container.querySelector(".print-visible svg")).toBeNull();

    triggerPrint();

    await waitFor(() => expect(mocks.exportToPDF).toHaveBeenCalledTimes(1));
    const pdfRoot = mocks.exportToPDF.mock.calls[0]?.[0] as HTMLElement;
    expect(pdfRoot.textContent).toContain("12345678901234");
    expect(pdfRoot.querySelector('img[alt="QR"]')).toBeNull();
    expect(qrToStringSpy).not.toHaveBeenCalled();
  });

  it("keeps server-only QR diagnostics out of browser logs and rendered props", async () => {
    const telemetry = captureConsoleCalls();

    try {
      const { container } = renderImmediateInvoice("pdf");

      await waitFor(() => expect(mocks.resolveQr).toHaveBeenCalledWith("persisted-immediate-qr-order"));
      await waitFor(() => expect(container.querySelector(".print-visible svg")).not.toBeNull());
      expectNoBrowserQrDiagnostics(telemetry.calls, [
        "persisted-immediate-qr-order",
        "12345678901234",
        "30712345678",
        "2750",
        VERIFIED_URL,
        POISONED_URL,
        "untrusted-client-raw",
      ]);
      expect(container.innerHTML).not.toMatch(/reason|stage|token|businessId|orderId/i);
      expect(container.innerHTML).not.toContain("untrusted-client-raw");
      expect(container.innerHTML).not.toContain(POISONED_URL);
    } finally {
      telemetry.restore();
    }
  });

  it("keeps immediate thermal printing on the same resolved value and omits QR for none", async () => {
    mocks.resolveQr.mockResolvedValue({ qrValue: null, qrKind: "none" });
    const { triggerPrint } = renderImmediateInvoice("thermal");

    await waitFor(() => expect(mocks.resolveQr).toHaveBeenCalledWith("persisted-immediate-qr-order"));
    triggerPrint();

    await waitFor(() => expect(mocks.printThermalReceipt).toHaveBeenCalledTimes(1));
    expect(mocks.printThermalReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ cae: expect.objectContaining({ cae: "12345678901234", qrValue: null }) }),
      false,
    );
    expect(qrToStringSpy).not.toHaveBeenCalled();
    expect(mocks.resolveQr).toHaveBeenCalledTimes(1);
  });

  it("uses the persisted order DTO for historical PDF and thermal reprints", async () => {
    const user = userEvent.setup();
    const sale = makeInvoice("historical-qr-order");
    render(<PrintOptionsPopover sale={sale} session={null} qzTrayEnabled={false} />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("Generar PDF"));
    await waitFor(() => expect(mocks.resolveQr).toHaveBeenCalledWith("historical-qr-order"));
    await waitFor(() => expect(mocks.exportToPDF).toHaveBeenCalledTimes(1));

    const pdfRoot = mocks.exportToPDF.mock.calls[0]?.[0] as HTMLElement;
    const qrImage = pdfRoot.querySelector<HTMLImageElement>('img[alt="QR"]');
    expect(qrImage?.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(decodedSvg(qrImage?.getAttribute("src") ?? "")).toContain("<svg");
    expect(pdfRoot.textContent).toContain("12345678901234");
    expect(pdfRoot.innerHTML).not.toContain(POISONED_URL);

    mocks.resolveQr.mockResolvedValue({ qrValue: LEGACY_RAW, qrKind: "legacy-raw" });
    mocks.exportToPDF.mockClear();
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("Impresión Térmica"));
    await waitFor(() => expect(mocks.printThermalReceipt).toHaveBeenCalledTimes(1));
    expect(mocks.printThermalReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ cae: expect.objectContaining({ cae: "12345678901234", qrValue: LEGACY_RAW }) }),
      false,
    );
    expect(mocks.resolveQr).toHaveBeenCalledTimes(2);
    expect(mocks.issueAfip).not.toHaveBeenCalled();
  });
});
