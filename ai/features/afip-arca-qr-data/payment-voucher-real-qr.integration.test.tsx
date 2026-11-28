import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { printPaymentVoucherAction } from "@/actions/payment-voucher";
import { PaymentVoucherRowActionClient } from "@/components/account-ledger/PaymentVoucherRowActionClient";
import QRCode from "qrcode";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findPayment: vi.fn(),
  findVoucher: vi.fn(),
  written: [] as string[],
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    cashMovement: { findFirst: mocks.findPayment },
    paymentVoucher: { findFirst: mocks.findVoucher },
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const date = new Date("2026-04-09T00:00:00.000Z");
const recipient = {
  name: "Cliente sintético",
  ivaCondition: "Consumidor Final",
  documentType: null,
  documentNumber: null,
};

function savedPayment() {
  return {
    id: "cash-movement-g2",
    businessId: "payment-tenant-g2",
    total: 2750,
    paidMethod: "Tarjeta",
    order: {
      id: "order-with-unrelated-cae",
      businessId: "payment-tenant-g2",
      total: 12000,
      date,
      seller: "QA seller",
      client: {
        id: "client-g2",
        name: recipient.name,
        ivaCondition: recipient.ivaCondition,
        fiscalDocumentType: null,
        fiscalDocumentNumber: null,
      },
      invoice: { cae: "98765432109876", billType: "Factura A", invoiceNumber: 808 },
    },
    business: {
      name: "Comercio sintético",
      cuit: "30712345678",
      ptoVenta: [12],
      condicionIva: "Responsable Inscripto",
    },
  };
}

function authorizedSavedVoucher() {
  return {
    id: "partial-voucher-g2",
    status: "AUTHORIZED",
    amount: 2750,
    billType: "Factura B",
    afipVoucherType: 6,
    invoiceNumber: 345,
    invoicePointOfSale: 12,
    cae: "12345678901234",
    caeVencimiento: "20261231",
    qrData: "raw-qr-from-this-authorized-payment-only",
    issuedAt: date,
    fiscalSnapshot: { client: recipient.name, clientIvaCondition: recipient.ivaCondition, recipient },
    currentAttempt: 2,
    attempts: [{
      attemptNumber: 2,
      status: "AUTHORIZED",
      billType: "Factura B",
      amount: 2750,
      invoicePointOfSale: 12,
      recipientSnapshot: recipient,
      requestDate: date,
    }],
  };
}

function popupWindow() {
  const popup = {
    document: {
      write: vi.fn((html: string) => mocks.written.push(html)),
      close: vi.fn(),
    },
    close: vi.fn(),
  } as unknown as Window;
  vi.spyOn(window, "open").mockReturnValue(popup);
  return popup;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.written = [];
  mocks.auth.mockResolvedValue({ user: { id: "user-payment-g2", businessId: "payment-tenant-g2" } });
  mocks.findPayment.mockResolvedValue(savedPayment());
  mocks.findVoucher.mockResolvedValue(authorizedSavedVoucher());
  vi.spyOn(QRCode, "toDataURL");
});

describe("partial voucher print QR with the real server action, service, and encoder", () => {
  it("resolves its own authorized payment DTO and includes a non-empty encoded PNG in the print popup", async () => {
    const dto = await printPaymentVoucherAction({ cashMovementId: "cash-movement-g2" });
    expect(dto).toMatchObject({
      status: "AUTHORIZED",
      cae: "12345678901234",
      invoiceNumber: 345,
      pointOfSale: 12,
      requestDate: "2026-04-09",
    });
    expect(dto?.qrUrl).toContain("https://www.afip.gob.ar/fe/qr/?p=");
    expect(mocks.findPayment).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "cash-movement-g2", businessId: "payment-tenant-g2", order: { is: { businessId: "payment-tenant-g2" } } },
    }));
    expect(mocks.findVoucher).toHaveBeenCalledWith(expect.objectContaining({
      where: { cashMovementId: "cash-movement-g2", businessId: "payment-tenant-g2" },
    }));
    expect(JSON.stringify(dto)).not.toContain("98765432109876");

    popupWindow();
    render(
      <PaymentVoucherRowActionClient
        cashMovementId="cash-movement-g2"
        amount={2750}
        status="AUTHORIZED"
        configuredPtoVentas={[12]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Print payment voucher" }));

    await waitFor(() => expect(mocks.written).toHaveLength(1));
    expect(QRCode.toDataURL).toHaveBeenCalledWith(dto!.qrUrl);
    const html = mocks.written[0];
    const imageSrc = html.match(/<img\b[^>]*src="([^"]+)"[^>]*>/i)?.[1];
    expect(imageSrc).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
    const imageBytes = Buffer.from(imageSrc!.split(",")[1], "base64");
    expect(imageBytes.length).toBeGreaterThan(100);
    expect(imageBytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(html).toContain('alt="Código QR del comprobante"');
    expect(html).toContain("12345678901234");
    expect(html).not.toContain("98765432109876");
  });

  it("keeps CAE printable but omits QR when the authorized payment has no URL or raw data", async () => {
    mocks.findVoucher.mockResolvedValue({ ...authorizedSavedVoucher(), qrData: null });
    mocks.findPayment.mockResolvedValue({ ...savedPayment(), business: { ...savedPayment().business, cuit: null } });
    const dto = await printPaymentVoucherAction({ cashMovementId: "cash-movement-g2" });
    expect(dto?.qrUrl).toBeNull();

    popupWindow();
    render(
      <PaymentVoucherRowActionClient
        cashMovementId="cash-movement-g2"
        amount={2750}
        status="AUTHORIZED"
        configuredPtoVentas={[12]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Print payment voucher" }));
    await waitFor(() => expect(mocks.written).toHaveLength(1));
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(mocks.written[0]).toContain("12345678901234");
    expect(mocks.written[0]).not.toMatch(/<img\b[^>]*alt="Código QR del comprobante"/i);
  });
});
