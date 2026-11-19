import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerPayment: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, warning: mocks.warning, error: mocks.error } }));
vi.mock("@/actions/unpaid-orders", () => ({ registerPayment: mocks.registerPayment }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  SelectValue: () => <span />,
}));
vi.mock("@/components/account-ledger/InvoiceTypeSelector", () => ({
  InvoiceTypeSelector: ({ onChange }: { onChange: (value: string) => void }) => (
    <select aria-label="Tipo de factura" onChange={(event) => onChange(event.target.value)} defaultValue="">
      <option value="">Seleccione</option>
      <option value="Factura B">Factura B</option>
    </select>
  ),
}));
vi.mock("@/components/account-ledger/PointOfSaleSelector", () => ({
  PointOfSaleSelector: ({ onChange }: { onChange: (value: string) => void }) => (
    <select aria-label="Punto de venta" onChange={(event) => onChange(event.target.value)} defaultValue="3">
      <option value="3">3</option>
    </select>
  ),
}));

import AddPaymentForm from "@/app/(protected)/account-ledger/[id]/AddPaymentForm";

describe("payment recorded versus voucher issuance outcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["FAILED", /pago registrado; la factura no se emitió/i],
    ["UNKNOWN", /pago registrado; verifique la emisión.*antes de reintentar/i],
  ])("distinguishes a recorded payment with voucher status %s", async (voucherStatus, expectedMessage) => {
    mocks.registerPayment.mockResolvedValue({ success: true, data: { voucherStatus } });
    render(<AddPaymentForm orderId="order-1" remainingBalance={100} businessId="tenant-1" configuredPtoVentas={[3]} showForm />);
    fireEvent.change(screen.getByPlaceholderText("Monto del pago"), { target: { value: "25" } });
    fireEvent.change(screen.getByRole("combobox", { name: /tipo de factura/i }), { target: { value: "Factura B" } });
    fireEvent.change(screen.getByRole("combobox", { name: /punto de venta/i }), { target: { value: "3" } });
    fireEvent.submit(screen.getByRole("button", { name: /confirmar/i }).closest("form")!);

    await waitFor(() => expect(mocks.registerPayment).toHaveBeenCalled());
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringMatching(expectedMessage));
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
