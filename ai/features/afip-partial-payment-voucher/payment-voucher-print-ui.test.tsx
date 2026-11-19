import { createElement } from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { printPaymentVoucherAction } from "@/actions/payment-voucher";
import { formatInvoiceNumberFull } from "@/lib/utils/bill-type";

declare global {
  interface ImportMeta {
    glob: <Module>(pattern: string) => Record<string, () => Promise<Module>>;
  }
}

interface PrintClientProps {
  cashMovementId: string;
  amount: number;
  status: "AUTHORIZED";
}

const write = vi.fn();
const close = vi.fn();
const popup = { document: { write, close } } as unknown as Window;

vi.mock("@/actions/payment-voucher", () => ({
  createOrRetryPaymentVoucherAction: vi.fn(),
  getPaymentVoucherStatusAction: vi.fn(),
  printPaymentVoucherAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") } }));

async function loadPaymentVoucherRowClient(): Promise<(props: PrintClientProps) => React.ReactNode> {
  const loaders = import.meta.glob<{
    PaymentVoucherRowActionClient: (props: PrintClientProps) => React.ReactNode;
  }>("/src/components/account-ledger/PaymentVoucherRowActionClient.tsx");
  const load = Object.values(loaders)[0];
  if (!load) throw new Error("Expected the payment voucher row client to be implemented");
  const loadedModule = await load();
  return loadedModule.PaymentVoucherRowActionClient;
}

describe("payment voucher recipient printing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    write.mockClear();
    close.mockClear();
  });

  it("prints document type and number from the immutable authorized attempt snapshot", async () => {
    const PaymentVoucherRowActionClient = await loadPaymentVoucherRowClient();
    vi.spyOn(window, "open").mockReturnValue(popup);
    vi.mocked(printPaymentVoucherAction).mockResolvedValue({
      status: "AUTHORIZED",
      billType: "Factura A",
      afipVoucherType: 1,
      total: 123,
      cae: "12345678901234",
      invoiceNumber: 77,
      pointOfSale: 8,
      issuedAt: new Date("2026-10-01T12:00:00.000Z"),
      recipient: {
        name: "Recipient at issuance",
        ivaCondition: "Responsable Inscripto",
        documentType: "DNI",
        documentNumber: "00123456",
      },
    } as never);
    render(createElement(PaymentVoucherRowActionClient, {
      cashMovementId: "movement-1",
      amount: 123,
      status: "AUTHORIZED",
    }));

    fireEvent.click(screen.getByRole("button", { name: /print.*invoice|print.*voucher|imprimir/i }));

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const printedHtml = String(write.mock.calls[0]?.[0]);
    expect(printedHtml).toContain("Recipient at issuance");
    expect(printedHtml).toContain("Responsable Inscripto");
    expect(printedHtml).toContain("DNI");
    expect(printedHtml).toContain("00123456");
    expect(printedHtml).toContain(formatInvoiceNumberFull(77, 8));
    expect(printPaymentVoucherAction).toHaveBeenCalledWith({ cashMovementId: "movement-1" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("prints Factura B with the snapshot's forced Consumidor Final condition", async () => {
    const PaymentVoucherRowActionClient = await loadPaymentVoucherRowClient();
    vi.spyOn(window, "open").mockReturnValue(popup);
    vi.mocked(printPaymentVoucherAction).mockResolvedValue({
      status: "AUTHORIZED",
      billType: "Factura B",
      afipVoucherType: 6,
      total: 12.99,
      cae: "12345678901234",
      invoiceNumber: 3,
      pointOfSale: 8,
      issuedAt: new Date("2026-10-01T12:00:00.000Z"),
      recipient: {
        name: "Recipient at issuance",
        ivaCondition: "Consumidor Final",
        documentType: null,
        documentNumber: null,
      },
    } as never);
    render(createElement(PaymentVoucherRowActionClient, {
      cashMovementId: "movement-2",
      amount: 12.99,
      status: "AUTHORIZED",
    }));

    fireEvent.click(screen.getByRole("button", { name: /print.*invoice|print.*voucher|imprimir/i }));

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(String(write.mock.calls[0]?.[0])).toContain("Condición IVA: Consumidor Final");
  });

  it("prints the authorized PtoVta/CbteDesde using the /newBill invoice-number format", async () => {
    const PaymentVoucherRowActionClient = await loadPaymentVoucherRowClient();
    vi.spyOn(window, "open").mockReturnValue(popup);
    vi.mocked(printPaymentVoucherAction).mockResolvedValue({
      status: "AUTHORIZED",
      billType: "Factura C",
      afipVoucherType: 11,
      total: 123,
      cae: "12345678901234",
      pointOfSale: 7, // PtoVta returned with the authorization
      invoiceNumber: 42, // CbteDesde returned with the authorization
      issuedAt: new Date("2026-11-18T12:00:00.000Z"),
      sequencePreview: 1,
      recipient: {
        name: "Authorized recipient",
        ivaCondition: "Consumidor Final",
        documentType: null,
        documentNumber: null,
      },
    } as never);
    render(createElement(PaymentVoucherRowActionClient, {
      cashMovementId: "movement-row-id-1",
      amount: 123,
      status: "AUTHORIZED",
    }));

    fireEvent.click(screen.getByRole("button", { name: /print.*invoice|print.*voucher|imprimir/i }));

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const printedHtml = String(write.mock.calls[0]?.[0]);
    const formattedAuthorizedNumber = formatInvoiceNumberFull(42, 7);
    expect(formattedAuthorizedNumber).toBe("007-0042");
    expect(printedHtml).toContain(`Factura ${formattedAuthorizedNumber}`);
    expect(printedHtml).not.toContain("00007-00000042");
    expect(printedHtml).not.toContain("00001-00000001");
    expect(printPaymentVoucherAction).toHaveBeenCalledWith({ cashMovementId: "movement-row-id-1" });
  });
});
