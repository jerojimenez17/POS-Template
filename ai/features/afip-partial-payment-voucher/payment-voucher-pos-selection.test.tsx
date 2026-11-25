import { createElement } from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerPayment } from "@/actions/unpaid-orders";

declare global {
  interface ImportMeta {
    glob: <Module>(pattern: string) => Record<string, () => Promise<Module>>;
  }
}

interface AddPaymentFormProps {
  orderId: string;
  remainingBalance: number;
  businessId: string;
  configuredPtoVentas: number[];
  showForm?: boolean;
}

vi.mock("@/actions/unpaid-orders", () => ({
  registerPayment: vi.fn().mockResolvedValue({ success: true, data: { voucherStatus: "AUTHORIZED" } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

async function loadAddPaymentForm(): Promise<(props: AddPaymentFormProps) => React.ReactNode> {
  const loaders = import.meta.glob<{ default: (props: AddPaymentFormProps) => React.ReactNode }>(
    "/src/app/(protected)/account-ledger/[id]/AddPaymentForm.tsx",
  );
  const load = Object.values(loaders)[0];
  if (!load) throw new Error("Expected the account-ledger payment form to be implemented");
  const loadedModule = await load();
  return loadedModule.default;
}

describe("initial account-ledger payment POS selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defaults to the first configured POS and submits the explicitly selected configured POS", async () => {
    const user = userEvent.setup();
    const AddPaymentForm = await loadAddPaymentForm();
    render(createElement(AddPaymentForm, {
      orderId: "order-1",
      remainingBalance: 123,
      businessId: "business-1",
      configuredPtoVentas: [4, 9],
      showForm: true,
    }));

    const posSelector = screen.getByRole("combobox", { name: /punto de venta/i });
    expect(posSelector).toHaveTextContent("4");
    await user.click(posSelector);
    await user.click(await screen.findByRole("option", { name: "9" }));

    await user.click(screen.getByRole("combobox", { name: /tipo de factura/i }));
    await user.click(await screen.findByRole("option", { name: "Factura B" }));
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(registerPayment).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "order-1",
      businessId: "business-1",
      billType: "Factura B",
      ptoVenta: 9,
    })));
  });

  it("does not allow payment submission without a configured POS", async () => {
    const AddPaymentForm = await loadAddPaymentForm();
    render(createElement(AddPaymentForm, {
      orderId: "order-2",
      remainingBalance: 25,
      businessId: "business-1",
      configuredPtoVentas: [],
      showForm: true,
    }));

    expect(screen.getByRole("combobox", { name: /punto de venta/i })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: /confirmar/i }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(registerPayment).not.toHaveBeenCalled());
  });

  it("uses the whole-peso remaining balance as the default, maximum, summary, and validation limit", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    const AddPaymentForm = await loadAddPaymentForm();

    render(createElement(AddPaymentForm, {
      orderId: "order-pesos",
      remainingBalance: 10,
      businessId: "business-1",
      configuredPtoVentas: [3],
      showForm: true,
    }));

    const amountInput = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(amountInput.value).toBe("10");
    expect(amountInput).toHaveAttribute("max", "10");
    expect(screen.getByText(/Se registrará \$10(?:\D|$)/)).toBeInTheDocument();

    await user.clear(amountInput);
    await user.type(amountInput, "11");
    fireEvent.submit(screen.getByRole("button", { name: /confirmar/i }).closest("form") as HTMLFormElement);

    expect(toast.error).toHaveBeenCalledWith("El monto no puede exceder el saldo pendiente");
    expect(registerPayment).not.toHaveBeenCalled();
  });

  it("offers Remito sin POS, previews no AFIP issuance, and submits the normalized amount without ptoVenta", async () => {
    const user = userEvent.setup();
    const AddPaymentForm = await loadAddPaymentForm();
    render(createElement(AddPaymentForm, {
      orderId: "order-remito-ui",
      remainingBalance: 20,
      businessId: "business-1",
      configuredPtoVentas: [3, 8],
      showForm: true,
    }));

    const amountInput = screen.getByRole("spinbutton");
    await user.clear(amountInput);
    await user.type(amountInput, "10.5");
    await user.click(screen.getByRole("combobox", { name: /tipo de factura/i }));
    await user.click(await screen.findByRole("option", { name: /remito/i }));

    expect(screen.queryByRole("combobox", { name: /punto de venta/i })).not.toBeInTheDocument();
    expect(screen.getByText(/sin emisión AFIP/i)).toBeInTheDocument();
    expect(screen.getByText(/\$11/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(registerPayment).toHaveBeenCalledWith({
      orderId: "order-remito-ui",
      amount: 11,
      paymentMethod: "Efectivo",
      businessId: "business-1",
      billType: "Remito",
    }));
    expect(registerPayment).not.toHaveBeenCalledWith(expect.objectContaining({ ptoVenta: expect.anything() }));
  });
});
