import { createElement } from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

declare global {
  interface ImportMeta {
    glob: <Module>(pattern: string) => Record<string, () => Promise<Module>>;
  }
}

interface PaymentVoucherRowActionProps {
  cashMovementId: string;
  amount: number;
  status: "NOT_REQUIRED" | "MISSING" | "FAILED" | "PENDING" | "ISSUING" | "AUTHORIZED" | "UNKNOWN";
  configuredPtoVentas?: number[];
  proposedBillType?: string;
  onCreateOrRetry?: (input: { cashMovementId: string; billType: string; ptoVenta: number }) => Promise<void>;
  onPrint?: (input: { cashMovementId: string }) => void;
}

async function loadRowAction(): Promise<(props: PaymentVoucherRowActionProps) => React.ReactNode> {
  const modules = import.meta.glob<{
    PaymentVoucherRowAction: (props: PaymentVoucherRowActionProps) => React.ReactNode;
  }>("/src/components/account-ledger/PaymentVoucherRowAction.tsx");
  const loadModule = Object.values(modules)[0];
  if (!loadModule) {
    throw new Error("Expected PaymentVoucherRowAction to be implemented before running this UI contract");
  }
  const loadedModule = await loadModule();
  return loadedModule.PaymentVoucherRowAction;
}

describe("individual payment-row voucher actions", () => {
  it("blocks creation for a legacy MISSING voucher until a safe recovery policy exists", async () => {
    const PaymentVoucherRowAction = await loadRowAction();
    const onCreateOrRetry = vi.fn().mockResolvedValue(undefined);
    render(createElement(PaymentVoucherRowAction, {
      cashMovementId: "movement-1",
      amount: 123,
      status: "MISSING",
      onCreateOrRetry,
    }));

    expect(screen.getByRole("status")).toHaveTextContent(/pago histórico sin reserva fiscal.*revisión manual/i);
    expect(screen.queryByRole("button", { name: /create.*invoice|invoice.*create|retry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onCreateOrRetry).not.toHaveBeenCalled();
  });

  it("states that a historical MISSING payment needs manual review without promising history recovery or retry", async () => {
    const PaymentVoucherRowAction = await loadRowAction();
    const onCreateOrRetry = vi.fn().mockResolvedValue(undefined);
    render(createElement(PaymentVoucherRowAction, {
      cashMovementId: "movement-legacy-review",
      amount: 123,
      status: "MISSING",
      onCreateOrRetry,
    }));

    expect(screen.getByRole("status")).toHaveTextContent(/pago histórico.*revisión manual/i);
    expect(screen.queryByText(/(recuperar|reintentar).*(desde|del) historial/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /crear factura|reintentar factura|retry|recover/i })).not.toBeInTheDocument();
    expect(onCreateOrRetry).not.toHaveBeenCalled();
  });

  it("preselects a failed voucher's prior type but requires explicit confirmation to retry", async () => {
    const PaymentVoucherRowAction = await loadRowAction();
    const onCreateOrRetry = vi.fn().mockResolvedValue(undefined);
    render(createElement(PaymentVoucherRowAction, {
      cashMovementId: "movement-retry-type",
      amount: 123,
      status: "FAILED",
      proposedBillType: "Factura A",
      configuredPtoVentas: [3, 8],
      onCreateOrRetry,
    }));

    fireEvent.click(screen.getByRole("button", { name: /retry|create.*invoice/i }));

    const typeSelect = screen.getByRole("combobox", { name: /tipo de factura/i });
    await waitFor(() => expect(typeSelect).toHaveTextContent("Factura A"));
    expect(onCreateOrRetry).not.toHaveBeenCalled();

    fireEvent.click(typeSelect);
    fireEvent.click(screen.getByRole("option", { name: "Factura B" }));
    await waitFor(() => expect(typeSelect).toHaveTextContent("Factura B"));
    expect(onCreateOrRetry).not.toHaveBeenCalled();

    fireEvent.click(typeSelect);
    fireEvent.click(screen.getByRole("option", { name: "Factura C" }));
    await waitFor(() => expect(typeSelect).toHaveTextContent("Factura C"));
    expect(onCreateOrRetry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(onCreateOrRetry).toHaveBeenCalledWith({
      cashMovementId: "movement-retry-type",
      billType: "Factura C",
      ptoVenta: 3,
    }));
  });

  it("uses an explicit choice when confirming a failed-voucher retry", async () => {
    const PaymentVoucherRowAction = await loadRowAction();
    const onCreateOrRetry = vi.fn().mockResolvedValue(undefined);
    render(createElement(PaymentVoucherRowAction, {
      cashMovementId: "movement-2",
      amount: 1,
      status: "FAILED",
      configuredPtoVentas: [3, 8],
      onCreateOrRetry,
    }));

    fireEvent.click(screen.getByRole("button", { name: /retry|create.*invoice/i }));
    fireEvent.click(screen.getByRole("combobox", { name: /tipo de factura/i }));
    fireEvent.click(screen.getByRole("option", { name: "Factura C" }));
    fireEvent.click(screen.getByRole("combobox", { name: /punto de venta/i }));
    fireEvent.click(screen.getByRole("option", { name: "8" }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(onCreateOrRetry).toHaveBeenCalledWith({
      cashMovementId: "movement-2",
      billType: "Factura C",
      ptoVenta: 8,
    }));
  });

  it("does not expose POS choices for a legacy payment without a safe recovery policy", async () => {
    const PaymentVoucherRowAction = await loadRowAction();
    render(createElement(PaymentVoucherRowAction, {
      cashMovementId: "movement-pos",
      amount: 123,
      status: "MISSING",
      configuredPtoVentas: [4, 9],
    }));

    expect(screen.getByRole("status")).toHaveTextContent(/revisión manual antes de emitir/i);
    expect(screen.queryByRole("combobox", { name: /punto de venta/i })).not.toBeInTheDocument();
  });

  it.each([
    ["PENDING", /pendiente de preparación/i],
    ["ISSUING", /emisión en proceso/i],
  ] as const)("announces %s as an active process and prevents duplicate submission", async (status, activeMessage) => {
    const PaymentVoucherRowAction = await loadRowAction();
    render(createElement(PaymentVoucherRowAction, { cashMovementId: "movement-3", amount: 3, status }));

    expect(screen.getByRole("button", { name: /invoice is processing/i })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(activeMessage);
    expect(screen.queryByRole("button", { name: /create invoice|retry payment|reintentar factura|crear factura/i })).not.toBeInTheDocument();
  });

  it("shows reconciliation guidance but no retry for an unknown remote outcome", async () => {
    const PaymentVoucherRowAction = await loadRowAction();
    render(createElement(PaymentVoucherRowAction, { cashMovementId: "movement-4", amount: 13, status: "UNKNOWN" }));

    expect(screen.getByText(/verificar emisión|verify issuance|reconcil/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry|create invoice/i })).not.toBeInTheDocument();
  });

  it("offers print for an authorized payment and passes that movement identity", async () => {
    const PaymentVoucherRowAction = await loadRowAction();
    const onPrint = vi.fn();
    render(createElement(PaymentVoucherRowAction, {
      cashMovementId: "movement-5",
      amount: 19.99,
      status: "AUTHORIZED",
      onPrint,
    }));

    fireEvent.click(screen.getByRole("button", { name: /print.*invoice|print.*voucher|imprimir/i }));

    expect(onPrint).toHaveBeenCalledWith({ cashMovementId: "movement-5" });
  });

  it("labels NOT_REQUIRED as Remito/no AFIP and renders no create, retry, or print action", async () => {
    const PaymentVoucherRowAction = await loadRowAction();
    const onCreateOrRetry = vi.fn().mockResolvedValue(undefined);
    const onPrint = vi.fn();

    render(createElement(PaymentVoucherRowAction, {
      cashMovementId: "movement-remito",
      amount: 11,
      status: "NOT_REQUIRED",
      onCreateOrRetry,
      onPrint,
    }));

    expect(screen.getByText(/sin emisión AFIP.*remito|remito.*sin emisión AFIP/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create|retry|print|invoice|factura|imprimir/i })).not.toBeInTheDocument();
    expect(onCreateOrRetry).not.toHaveBeenCalled();
    expect(onPrint).not.toHaveBeenCalled();
  });
});
