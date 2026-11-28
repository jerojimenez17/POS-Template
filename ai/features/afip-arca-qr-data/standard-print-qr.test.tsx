import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { QRCodeSVG } from "qrcode.react";
import PrintableTable from "@/components/Billing/PrintableTable";
import { BillContext } from "@/context/BillContext";
import type BillState from "@/models/BillState";
import type CAE from "@/models/CAE";
import { printThermalReceipt } from "@/lib/print";

const mocks = vi.hoisted(() => ({
  resolveOrderQrPrintDtoAction: vi.fn(),
}));

vi.mock("@/actions/sales/qr-print", () => ({
  resolveOrderQrPrintDtoAction: mocks.resolveOrderQrPrintDtoAction,
}));
vi.mock("@/actions/business", () => ({ getBusinessBillingInfoAction: vi.fn().mockResolvedValue({
  razonSocial: "Comercio QA",
  cuit: "30712345678",
  condicionIva: "Responsable Inscripto",
}) }));
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "font-test", variable: "--font-test" }) }));
vi.mock("@/lib/print", () => ({
  printThermalReceipt: vi.fn().mockResolvedValue(true),
  exportToPDF: vi.fn().mockResolvedValue(true),
  buildPDFHTML: vi.fn().mockReturnValue("<html></html>"),
  PDF_STYLES: "",
}));
vi.mock("qrcode", () => ({ default: { toString: vi.fn().mockResolvedValue("<svg></svg>") } }));
vi.mock("qrcode.react", () => ({ QRCodeSVG: vi.fn(() => null) }));

const verifiedUrl = "https://www.afip.gob.ar/fe/qr/?p=c3ludGhldGljLXZvdWNoZXItcGF5bG9hZA==";
const verifiedRaw = "gateway-raw-bound-to-this-order";
const maliciousUrl = "https://attacker.invalid/qr?p=forged";
const maliciousRaw = "attacker-controlled-raw";

function renderInvoice(
  cae: CAE,
  options: { orderId?: string; printTrigger?: number } = {},
) {
  const state = {
    id: options.orderId ?? "persisted-order-qr-qa",
    products: [],
    total: 2750,
    totalWithDiscount: 2750,
    seller: "QA seller",
    discount: 0,
    date: new Date("2026-04-09T00:00:00.000Z"),
    typeDocument: "DNI",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    twoMethods: false,
    billType: "Factura B",
    ptoVenta: 12,
    CAE: cae,
  } as unknown as BillState;
  const context = {
    BillState: state,
    dispatch: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    printMode: "thermal" as const,
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

  const view = render(makeUi(options.printTrigger ?? 0));
  return { ...view, triggerPrint: () => view.rerender(makeUi(1)) };
}

function maliciousCae(): CAE {
  return {
    CAE: "12345678901234",
    vencimiento: "20261231",
    nroComprobante: 345,
    // Client CAE JSON is deliberately poisoned; only the DTO can authorize a QR.
    qrData: maliciousRaw,
    qrUrl: maliciousUrl,
    requestDate: "1999-01-01",
  } as CAE;
}

function qrSvgWasRenderedWith(value: string): boolean {
  return vi.mocked(QRCodeSVG).mock.calls.some(([props]) =>
    (props as { value?: string }).value === value,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveOrderQrPrintDtoAction.mockResolvedValue({ qrValue: verifiedUrl, qrKind: "verified-url" });
});

describe("server-resolved standard invoice QR in PrintableTable", () => {
  it("resolves only the persisted order DTO and renders its verified URL, ignoring poisoned CAE props", async () => {
    renderInvoice(maliciousCae());

    await waitFor(() => expect(mocks.resolveOrderQrPrintDtoAction).toHaveBeenCalledTimes(1));
    expect(mocks.resolveOrderQrPrintDtoAction).toHaveBeenCalledWith("persisted-order-qr-qa");
    await waitFor(() => expect(QRCode.toString).toHaveBeenCalledWith(
      verifiedUrl,
      { type: "svg", margin: 0, width: 60 },
    ));
    expect(qrSvgWasRenderedWith(verifiedUrl)).toBe(true);
    expect(QRCode.toString).not.toHaveBeenCalledWith(maliciousUrl, expect.anything());
    expect(QRCode.toString).not.toHaveBeenCalledWith(maliciousRaw, expect.anything());
  });

  it("renders the exact raw value only when the persisted order resolver returns its verified raw fallback", async () => {
    mocks.resolveOrderQrPrintDtoAction.mockResolvedValue({ qrValue: verifiedRaw, qrKind: "verified-raw" });

    renderInvoice(maliciousCae());

    await waitFor(() => expect(QRCode.toString).toHaveBeenCalledWith(
      verifiedRaw,
      { type: "svg", margin: 0, width: 60 },
    ));
    expect(mocks.resolveOrderQrPrintDtoAction).toHaveBeenCalledWith("persisted-order-qr-qa");
    expect(qrSvgWasRenderedWith(verifiedRaw)).toBe(true);
    expect(QRCode.toString).not.toHaveBeenCalledWith(maliciousRaw, expect.anything());
  });

  it("does not request a DTO before an order has an id and never uses QR values from CAE props", async () => {
    renderInvoice(maliciousCae(), { orderId: "" });

    await waitFor(() => expect(screen.getByText("12345678901234")).toBeInTheDocument());
    expect(mocks.resolveOrderQrPrintDtoAction).not.toHaveBeenCalled();
    expect(QRCode.toString).not.toHaveBeenCalled();
    expect(vi.mocked(QRCodeSVG)).not.toHaveBeenCalled();
  });

  it("omits the symbol when the persisted DTO has no QR and still prints the authorized CAE", async () => {
    mocks.resolveOrderQrPrintDtoAction.mockResolvedValue({ qrValue: null, qrKind: "none" });
    const { triggerPrint } = renderInvoice(maliciousCae());

    await waitFor(() => expect(mocks.resolveOrderQrPrintDtoAction).toHaveBeenCalledWith("persisted-order-qr-qa"));
    await waitFor(() => expect(screen.getByText("12345678901234")).toBeInTheDocument());
    expect(QRCode.toString).not.toHaveBeenCalled();
    expect(vi.mocked(QRCodeSVG)).not.toHaveBeenCalled();

    triggerPrint();

    await waitFor(() => expect(printThermalReceipt).toHaveBeenCalled());
    expect(printThermalReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ cae: expect.objectContaining({ cae: "12345678901234", qrValue: null }) }),
      false,
    );
  });
});
