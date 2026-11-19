import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  qrModuleEvaluated,
  qrToDataURL,
  printPaymentVoucherAction,
  createOrRetryPaymentVoucherAction,
  getPaymentVoucherStatusAction,
  updateClient,
  routerRefresh,
} = vi.hoisted(() => ({
  qrModuleEvaluated: vi.fn(),
  qrToDataURL: vi.fn(),
  printPaymentVoucherAction: vi.fn(),
  createOrRetryPaymentVoucherAction: vi.fn(),
  getPaymentVoucherStatusAction: vi.fn(),
  updateClient: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerRefresh }) }));
vi.mock("@/actions/clients", () => ({ updateClient }));
vi.mock("@/actions/payment-voucher", () => ({
  createOrRetryPaymentVoucherAction,
  getPaymentVoucherStatusAction,
  printPaymentVoucherAction,
}));

describe("PaymentVoucherRowActionClient QR code loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    qrToDataURL.mockResolvedValue("data:image/png;base64,qr-image");
    printPaymentVoucherAction.mockResolvedValue({
      billType: "Factura B",
      fiscalSnapshot: {},
      recipient: { name: "Cliente", ivaCondition: "Consumidor Final" },
      total: 125,
      pointOfSale: 1,
      invoiceNumber: 42,
      issuedAt: "2026-11-06T10:00:00.000Z",
      cae: "12345678901234",
      caeVencimiento: "2026-11-16",
      qrData: "voucher-qr-data",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and uses qrcode only when the authorized voucher is printed", async () => {
    vi.doMock("qrcode", () => {
      qrModuleEvaluated();
      return {
        default: { toDataURL: qrToDataURL },
        toDataURL: qrToDataURL,
      };
    });

    const { PaymentVoucherRowActionClient } = await import("./PaymentVoucherRowActionClient");
    const popup = {
      document: { write: vi.fn(), close: vi.fn() },
      close: vi.fn(),
    } as unknown as WindowProxy;
    vi.spyOn(window, "open").mockReturnValue(popup);
    const user = userEvent.setup();

    render(
      <PaymentVoucherRowActionClient
        cashMovementId="movement-1"
        amount={125}
        status="AUTHORIZED"
        configuredPtoVentas={[]}
        client={null}
      />,
    );

    expect(screen.getByRole("button", { name: "Print payment voucher" })).toBeInTheDocument();
    const qrModuleLoadsAtRender = qrModuleEvaluated.mock.calls.length;
    expect(qrToDataURL).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Print payment voucher" }));

    await waitFor(() => {
      expect(qrModuleEvaluated).toHaveBeenCalledTimes(1);
      expect(qrToDataURL).toHaveBeenCalledWith("voucher-qr-data");
      expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining("data:image/png;base64,qr-image"));
    });
    expect(printPaymentVoucherAction).toHaveBeenCalledWith({ cashMovementId: "movement-1" });
    expect(qrModuleLoadsAtRender).toBe(0);
  });
});
