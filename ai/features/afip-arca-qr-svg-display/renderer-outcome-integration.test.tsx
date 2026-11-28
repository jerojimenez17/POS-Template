import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  report: vi.fn(),
  resolveQr: vi.fn(),
  getBillingInfo: vi.fn(),
  printVoucher: vi.fn(),
  toString: vi.fn(),
  toDataURL: vi.fn(),
}));

vi.mock("@/actions/sales/qr-print", () => ({
  resolveOrderQrPrintDtoAction: mocks.resolveQr,
  reportQrRendererOutcomeAction: mocks.report,
}));
vi.mock("@/actions/business", () => ({ getBusinessBillingInfoAction: mocks.getBillingInfo }));
vi.mock("@/actions/payment-voucher", () => ({
  createOrRetryPaymentVoucherAction: vi.fn(),
  getPaymentVoucherStatusAction: vi.fn(),
  printPaymentVoucherAction: mocks.printVoucher,
  reconcilePaymentVoucherAction: vi.fn(),
}));
vi.mock("@/lib/print", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/print")>();
  return {
    ...actual,
    printThermalReceipt: vi.fn().mockResolvedValue(true),
    exportToPDF: vi.fn().mockResolvedValue(true),
  };
});
vi.mock("qrcode", () => ({ default: { toString: mocks.toString, toDataURL: mocks.toDataURL } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "qr-test-font", variable: "--qr-test-font" }) }));

import PrintableTable from "@/components/Billing/PrintableTable";
import { BillContext } from "@/context/BillContext";
import type BillState from "@/models/BillState";
import type CAE from "@/models/CAE";
import { PaymentVoucherRowActionClient } from "@/components/account-ledger/PaymentVoucherRowActionClient";

const PRIVATE_SENTINELS = [
  "https://qr-private.invalid/?p=private-payload",
  "RAW-QR-PRIVATE-SENTINEL",
  "CAE-PRIVATE-SENTINEL",
  "CUIT-PRIVATE-SENTINEL",
  "ORDER-PRIVATE-SENTINEL",
  "TOKEN-PRIVATE-SENTINEL",
];

function invoiceState(): BillState {
  return {
    id: "ORDER-PRIVATE-SENTINEL",
    products: [],
    total: 20,
    totalWithDiscount: 20,
    seller: "Synthetic QA seller",
    discount: 0,
    date: new Date("2026-01-01T12:00:00.000Z"),
    typeDocument: "DNI",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    clientIvaCondition: "Consumidor Final",
    twoMethods: false,
    billType: "Factura B",
    ptoVenta: 3,
    CAE: {
      CAE: "CAE-PRIVATE-SENTINEL",
      vencimiento: "20261231",
      nroComprobante: 45,
      qrData: "RAW-QR-PRIVATE-SENTINEL",
      qrUrl: PRIVATE_SENTINELS[0],
    } as CAE,
  } as unknown as BillState;
}

function renderInvoice(printMode: "pdf" | "thermal" = "pdf") {
  const state = invoiceState();
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
      <PrintableTable printTrigger={printTrigger} className="" handleClose={vi.fn()} session={null} externalState={state} />
    </BillContext.Provider>
  );
  const view = render(makeUi(0));
  return { ...view, triggerPrint: () => view.rerender(makeUi(1)) };
}

async function flushClientWork(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.report.mockResolvedValue({ success: true });
  mocks.resolveQr.mockResolvedValue({ qrValue: PRIVATE_SENTINELS[0], qrKind: "verified-url" });
  mocks.getBillingInfo.mockResolvedValue({ razonSocial: "Synthetic business", cuit: "CUIT-PRIVATE-SENTINEL" });
  mocks.toString.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>');
  mocks.toDataURL.mockResolvedValue("data:image/png;base64,iVBORw0KGgo=");
  mocks.printVoucher.mockResolvedValue({
    billType: "Factura B",
    cae: "CAE-PRIVATE-SENTINEL",
    caeVencimiento: "20261231",
    invoiceNumber: 45,
    pointOfSale: 3,
    issuedAt: "2026-01-01T12:00:00.000Z",
    total: 20,
    qrUrl: PRIVATE_SENTINELS[0],
    qrData: "RAW-QR-PRIVATE-SENTINEL",
    recipient: { name: "Synthetic", ivaCondition: "Consumidor Final", documentType: "CUIT", documentNumber: "CUIT-PRIVATE-SENTINEL" },
  });
  vi.spyOn(window, "open").mockReturnValue({
    document: { write: vi.fn(), close: vi.fn() },
    close: vi.fn(),
  } as unknown as Window);
});

describe("renderer-side outcome reports", () => {
  it("reports PDF generated only after a non-empty QR SVG exists and sends enums only", async () => {
    let resolveSvg: ((svg: string) => void) | undefined;
    mocks.toString.mockImplementation(() => new Promise<string>((resolve) => { resolveSvg = resolve; }));
    const { container, triggerPrint } = renderInvoice("pdf");

    await waitFor(() => expect(mocks.toString).toHaveBeenCalled());
    expect(mocks.report).not.toHaveBeenCalled();

    resolveSvg?.('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>');
    await waitFor(() => expect(container.querySelector(".print-visible svg")).not.toBeNull());
    triggerPrint();

    await flushClientWork();
    expect(mocks.report).toHaveBeenCalledWith({ renderer: "pdf", outcome: "generated" });
    for (const call of mocks.report.mock.calls) {
      expect(call).toHaveLength(1);
      expect(Object.keys(call[0] as object).sort()).toEqual(["outcome", "renderer"]);
    }
    const requests = JSON.stringify(mocks.report.mock.calls);
    for (const secret of PRIVATE_SENTINELS) expect(requests).not.toContain(secret);
    expect(requests).not.toMatch(/https?:\/\/|payload|qrValue|orderId|tenant|token|CAE|CUIT/i);
  });

  it("reports renderer failure when SVG construction rejects, without sending its value or error", async () => {
    mocks.toString.mockRejectedValue(new Error("private renderer failure with https://never-log.invalid/RAW-QR-PRIVATE-SENTINEL"));
    const { triggerPrint } = renderInvoice("pdf");

    await waitFor(() => expect(mocks.toString).toHaveBeenCalled());
    triggerPrint();

    await flushClientWork();
    expect(mocks.report).toHaveBeenCalledWith({ renderer: "pdf", outcome: "failed" });
    const requests = JSON.stringify(mocks.report.mock.calls);
    expect(requests).not.toMatch(/never-log\.invalid|RAW-QR|private renderer failure|CAE-PRIVATE|ORDER-PRIVATE/i);
  });

  it("reports partial generated only after a non-empty PNG data URL is produced", async () => {
    let resolvePng: ((png: string) => void) | undefined;
    mocks.toDataURL.mockImplementation(() => new Promise<string>((resolve) => { resolvePng = resolve; }));
    render(<PaymentVoucherRowActionClient
      cashMovementId="ORDER-PRIVATE-SENTINEL"
      amount={20}
      status="AUTHORIZED"
      configuredPtoVentas={[3]}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Print payment voucher" }));
    await waitFor(() => expect(mocks.toDataURL).toHaveBeenCalled());
    expect(mocks.report).not.toHaveBeenCalled();

    resolvePng?.("data:image/png;base64,iVBORw0KGgo=");
    await flushClientWork();
    expect(mocks.report).toHaveBeenCalledWith({ renderer: "partial", outcome: "generated" });
    const requests = JSON.stringify(mocks.report.mock.calls);
    for (const secret of PRIVATE_SENTINELS) expect(requests).not.toContain(secret);
    expect(requests).not.toMatch(/https?:\/\/|payload|qrValue|orderId|tenant|token|CAE|CUIT/i);
  });

  it("reports partial failed instead of generated when PNG construction rejects", async () => {
    mocks.toDataURL.mockRejectedValue(new Error(`private failure ${PRIVATE_SENTINELS.join(" ")}`));
    render(<PaymentVoucherRowActionClient
      cashMovementId="ORDER-PRIVATE-SENTINEL"
      amount={20}
      status="AUTHORIZED"
      configuredPtoVentas={[3]}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Print payment voucher" }));
    await waitFor(() => expect(mocks.toDataURL).toHaveBeenCalled());

    await flushClientWork();
    expect(mocks.report).toHaveBeenCalledWith({ renderer: "partial", outcome: "failed" });
    expect(mocks.report).not.toHaveBeenCalledWith({ renderer: "partial", outcome: "generated" });
    const requests = JSON.stringify(mocks.report.mock.calls);
    for (const secret of PRIVATE_SENTINELS) expect(requests).not.toContain(secret);
    expect(requests).not.toMatch(/private failure|https?:\/\/|payload|qrValue|orderId|tenant|token|CAE|CUIT/i);
  });
});
