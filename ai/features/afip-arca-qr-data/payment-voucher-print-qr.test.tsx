import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import {
  createOrRetryPaymentVoucherAction,
  getPaymentVoucherStatusAction,
  printPaymentVoucherAction,
  reconcilePaymentVoucherAction,
} from "@/actions/payment-voucher";
import { PaymentVoucherRowActionClient } from "@/components/account-ledger/PaymentVoucherRowActionClient";

vi.mock("@/actions/payment-voucher", () => ({
  createOrRetryPaymentVoucherAction: vi.fn(),
  getPaymentVoucherStatusAction: vi.fn(),
  printPaymentVoucherAction: vi.fn(),
  reconcilePaymentVoucherAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,cGFydGlhbA==") } }));

const qrPayload = {
  ver: 1,
  fecha: "2026-04-09",
  cuit: 30712345678,
  ptoVta: 12,
  tipoCmp: 6,
  nroCmp: 345,
  importe: 2750,
  moneda: "PES",
  ctz: 1,
  tipoDocRec: 99,
  nroDocRec: 0,
  tipoCodAut: "E",
  codAut: 12345678901234,
};
const ownPaymentUrl = `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(qrPayload))}`;

function voucherDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "AUTHORIZED",
    billType: "Factura B",
    total: 2750,
    cae: "12345678901234",
    caeVencimiento: "20261231",
    invoiceNumber: 345,
    pointOfSale: 12,
    issuedAt: new Date("2026-04-09T16:30:00.000Z"),
    requestDate: "2026-04-09",
    qrUrl: ownPaymentUrl,
    qrData: "raw-qr-of-this-payment",
    recipient: {
      name: "Cliente de pago parcial",
      ivaCondition: "Consumidor Final",
      documentType: null,
      documentNumber: null,
    },
    // Adversarial fields must not be used as partial voucher identity.
    orderCae: "98765432109876",
    otherPaymentQrUrl: "https://untrusted.example/qr",
    ...overrides,
  };
}

function mockPopup() {
  const written: string[] = [];
  const popup = {
    document: {
      write: vi.fn((html: string) => written.push(html)),
      close: vi.fn(),
    },
    close: vi.fn(),
  } as unknown as Window;
  vi.spyOn(window, "open").mockReturnValue(popup);
  return { popup, written };
}

const renderAuthorizedPayment = () => render(
  <PaymentVoucherRowActionClient
    cashMovementId="payment-qr-qa"
    amount={2750}
    status="AUTHORIZED"
    configuredPtoVentas={[12]}
  />,
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(QRCode.toDataURL).mockResolvedValue("data:image/png;base64,cGFydGlhbA==" as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PaymentVoucherRowActionClient partial voucher QR", () => {
  it("prints the authorized partial voucher URL rather than raw gateway data or an order CAE", async () => {
    vi.mocked(printPaymentVoucherAction).mockResolvedValue(voucherDto());
    const { written } = mockPopup();

    renderAuthorizedPayment();
    fireEvent.click(screen.getByRole("button", { name: "Print payment voucher" }));

    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalledWith(ownPaymentUrl));
    expect(written.join("\n")).toContain("data:image/png;base64,cGFydGlhbA==");
    expect(written.join("\n")).not.toContain("98765432109876");
    expect(createOrRetryPaymentVoucherAction).not.toHaveBeenCalled();
    expect(reconcilePaymentVoucherAction).not.toHaveBeenCalled();
    expect(getPaymentVoucherStatusAction).not.toHaveBeenCalled();
  });

  it("uses only the same partial voucher raw QR when its local URL is unavailable", async () => {
    vi.mocked(printPaymentVoucherAction).mockResolvedValue(voucherDto({ qrUrl: null }));
    mockPopup();

    renderAuthorizedPayment();
    fireEvent.click(screen.getByRole("button", { name: "Print payment voucher" }));

    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalledWith("raw-qr-of-this-payment"));
    expect(QRCode.toDataURL).not.toHaveBeenCalledWith("98765432109876");
    expect(QRCode.toDataURL).not.toHaveBeenCalledWith("https://untrusted.example/qr");
  });

  it("omits a missing raw QR without blocking printing the authorized CAE", async () => {
    vi.mocked(printPaymentVoucherAction).mockResolvedValue(voucherDto({ qrUrl: null, qrData: "" }));
    const { written } = mockPopup();

    renderAuthorizedPayment();
    fireEvent.click(screen.getByRole("button", { name: "Print payment voucher" }));

    await waitFor(() => expect(written.length).toBeGreaterThan(0));
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(written.join("\n")).toContain("12345678901234");
    expect(written.join("\n")).not.toContain('alt="Código QR del comprobante"');
  });
});
