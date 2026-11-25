import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paymentActionMocks = vi.hoisted(() => ({
  createOrRetry: vi.fn(),
  getStatus: vi.fn(),
  print: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: paymentActionMocks.refresh }) }));
vi.mock("@/actions/clients", () => ({ updateClient: vi.fn() }));
vi.mock("@/actions/payment-voucher", () => ({
  createOrRetryPaymentVoucherAction: paymentActionMocks.createOrRetry,
  getPaymentVoucherStatusAction: paymentActionMocks.getStatus,
  printPaymentVoucherAction: paymentActionMocks.print,
}));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn() } }));

async function loadVoucherRow() {
  const modules = import.meta.glob<{
    PaymentVoucherRowActionClient: (props: {
      cashMovementId: string;
      amount: number;
      status: "MISSING" | "FAILED" | "PENDING" | "ISSUING" | "AUTHORIZED" | "UNKNOWN";
      proposedBillType?: string;
      configuredPtoVentas: number[];
      client: null;
    }) => ReactNode;
  }>("/src/components/account-ledger/PaymentVoucherRowActionClient.tsx");
  const loadModule = Object.values(modules)[0];
  expect(loadModule, "the payment voucher row action should exist").toBeDefined();
  if (!loadModule) throw new Error("PaymentVoucherRowActionClient module is missing");
  return (await loadModule()).PaymentVoucherRowActionClient;
}

describe("account-ledger payment-voucher row failure feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces a safe accessible message when a pending voucher status read fails", async () => {
    paymentActionMocks.getStatus.mockResolvedValue(null);
    const PaymentVoucherRowActionClient = await loadVoucherRow();
    render(<PaymentVoucherRowActionClient
      cashMovementId="movement-status-failure"
      amount={45}
      status="PENDING"
      configuredPtoVentas={[3]}
      client={null}
    />);

    await waitFor(() => expect(paymentActionMocks.getStatus).toHaveBeenCalledWith({ cashMovementId: "movement-status-failure" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/no se pudo consultar|no se pudo verificar/i);
    expect(screen.queryByText(/sql|prisma|credential|secret/i)).not.toBeInTheDocument();
  });

  it("surfaces safe feedback when printing an authorized voucher cannot retrieve the print data", async () => {
    const close = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ close } as unknown as Window);
    paymentActionMocks.print.mockResolvedValue(null);
    const PaymentVoucherRowActionClient = await loadVoucherRow();
    render(<PaymentVoucherRowActionClient
      cashMovementId="movement-print-failure"
      amount={45}
      status="AUTHORIZED"
      configuredPtoVentas={[3]}
      client={null}
    />);

    fireEvent.click(screen.getByRole("button", { name: /print payment voucher/i }));

    await waitFor(() => expect(paymentActionMocks.print).toHaveBeenCalledWith({ cashMovementId: "movement-print-failure" }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/no se pudo imprimir|no se pudo obtener/i);
    expect(paymentActionMocks.createOrRetry).not.toHaveBeenCalled();
  });

  it("tells the operator to verify an UNKNOWN issuance instead of retrying it", async () => {
    paymentActionMocks.createOrRetry.mockResolvedValue({ voucherStatus: "UNKNOWN" });
    const PaymentVoucherRowActionClient = await loadVoucherRow();
    render(<PaymentVoucherRowActionClient
      cashMovementId="movement-unknown-issuance"
      amount={45}
      status="MISSING"
      configuredPtoVentas={[3]}
      client={null}
    />);

    fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
    fireEvent.click(screen.getByRole("radio", { name: /factura b/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm issue/i }));

    await waitFor(() => expect(paymentActionMocks.createOrRetry).toHaveBeenCalledWith({
      cashMovementId: "movement-unknown-issuance",
      billType: "Factura B",
      ptoVenta: 3,
      retry: false,
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/verifique la emisión.*antes de reintentar|verificar emisión.*no vuelva a emitir/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/la factura no se emitió/i);
  });
});
