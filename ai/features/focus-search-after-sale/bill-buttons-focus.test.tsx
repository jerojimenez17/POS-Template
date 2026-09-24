import React from "react";
import { fireEvent, render, screen, waitFor } from "../../../tests/test-utils";
import BillButtons from "@/components/Billing/BillButtons";
import { BillContext } from "@/context/BillContext";
import { createAfipVoucherAction } from "@/actions/afip";
import { processSaleAction, updateOrderAction } from "@/actions/sales";
import { createBudgetAction } from "@/actions/budget";
import { getShortcutConfigsAction } from "@/actions/shortcuts";
import { useCashbox } from "@/context/CashboxContext";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/afip", () => ({
  createAfipVoucherAction: vi.fn(),
}));

vi.mock("@/actions/sales", () => ({
  processSaleAction: vi.fn(),
  updateOrderAction: vi.fn(),
}));

vi.mock("@/actions/budget", () => ({
  createBudgetAction: vi.fn(),
}));

vi.mock("@/actions/shortcuts", () => ({
  getShortcutConfigsAction: vi.fn(),
  getProductByShortcutAction: vi.fn(),
}));

vi.mock("@/context/CashboxContext", () => ({
  useCashbox: vi.fn(),
  CashboxProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

// Keep the modal's successful completion callback observable at the BillButtons
// boundary. The real modal owns client/order actions and calls onSuccess only
// after its successful create/append/budget branches.
vi.mock("@/components/ledger/ClientSelectionModal", () => ({
  default: ({
    open,
    mode,
    onSuccess,
    onOpenChange,
  }: {
    open: boolean;
    mode?: "unpaid" | "budget";
    onSuccess?: () => void;
    onOpenChange: (open: boolean) => void;
  }) => {
    if (!open) return null;

    return (
      <section aria-label={mode === "budget" ? "Budget selection" : "Unpaid order selection"}>
        {mode === "budget" ? (
          <>
            <button onClick={() => onSuccess?.()}>Complete budget creation</button>
            <button onClick={() => undefined}>Budget creation failed</button>
          </>
        ) : (
          <>
            <button onClick={() => onSuccess?.()}>Complete unpaid order creation</button>
            <button onClick={() => onSuccess?.()}>Complete append to unpaid order</button>
            <button onClick={() => undefined}>Unpaid order action failed</button>
            <button onClick={() => onOpenChange(false)}>Close selection</button>
          </>
        )}
      </section>
    );
  },
}));

const session = {
  user: {
    id: "user-focus-test",
    email: "cashier@example.com",
    businessId: "business-focus-test",
    business: { features: { hasBudget: true } },
  },
  expires: "2099-01-01",
};

const saleProduct = {
  id: "product-1",
  code: "P-1",
  description: "Test product",
  price: 100,
  salePrice: 100,
  amount: 1,
};

const makeBillContext = () => ({
  BillState: {
    id: "",
    products: [saleProduct],
    total: 100,
    totalWithDiscount: 100,
    discount: 0,
    seller: "cashier@example.com",
    typeDocument: "DNI",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    paidMethod: "Efectivo",
    billType: "Factura C",
    twoMethods: false,
    totalSecondMethod: 0,
    secondPaidMethod: "Debito",
    date: new Date("2025-01-02T12:00:00.000Z"),
  },
  dispatch: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
  onOrderResetRef: { current: null },
  printMode: "thermal" as const,
  setPrintMode: vi.fn(),
  initialBillType: "Factura C",
  billTypeRef: { current: "Factura C" },
  defaultPtoVenta: 1,
  setFocusPriceProductId: vi.fn(),
});

interface SaleAwareProps extends React.ComponentProps<typeof BillButtons> {
  onSaleCreated?: () => void;
}

// Cast only the optional proposed callback contract so this test suite still
// type-checks before production adds the new prop.
const SaleAwareBillButtons = BillButtons as React.ComponentType<SaleAwareProps>;

const renderBillButtons = (options?: {
  isEditing?: boolean;
  onSaleCreated?: () => void;
}) => {
  const billContext = makeBillContext();
  const handlePrint = vi.fn();

  render(
    <BillContext.Provider value={billContext as never}>
      <SaleAwareBillButtons
        session={session as never}
        handlePrint={handlePrint}
        isEditing={options?.isEditing}
        orderId={options?.isEditing ? "sale-existing" : undefined}
        onSaleCreated={options?.onSaleCreated}
      />
    </BillContext.Provider>,
    { sessionMock: session },
  );

  return { billContext, handlePrint };
};

const validCae = {
  success: true,
  data: {
    cae: "12345678901234",
    vencimiento: "20261231",
    nroComprobante: 1,
    qrData: "",
  },
};

describe("BillButtons — focus callback for successful new sales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCashbox).mockReturnValue({
      hasActiveSession: true,
      setIsOpeningModalOpen: vi.fn(),
    } as never);
    vi.mocked(getShortcutConfigsAction).mockResolvedValue({ success: true, data: [] } as never);
    vi.mocked(processSaleAction).mockResolvedValue({ success: true } as never);
    vi.mocked(createAfipVoucherAction).mockResolvedValue(validCae as never);
    vi.mocked(updateOrderAction).mockResolvedValue({ success: true } as never);
    vi.mocked(createBudgetAction).mockResolvedValue({ success: true } as never);
  });

  it.each([
    ["Factura", "Facturar", "Confirmar creación de Factura"],
    ["Remito", "Remito", "Confirmar creación de Remito"],
  ])("requests focus once after a successful %s has reset checkout", async (_kind, buttonName, dialogTitle) => {
    const onSaleCreated = vi.fn();
    const { billContext, handlePrint } = renderBillButtons({ onSaleCreated });

    fireEvent.click(screen.getByRole("button", { name: buttonName }));
    expect(await screen.findByRole("heading", { name: dialogTitle })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(billContext.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: "removeAll" }),
      ),
    );
    expect(onSaleCreated).toHaveBeenCalledTimes(1);
    expect(billContext.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "removeAll" }),
    );
    expect(billContext.dispatch.mock.invocationCallOrder[0]).toBeLessThan(
      onSaleCreated.mock.invocationCallOrder[0],
    );
    expect(handlePrint).toHaveBeenCalledTimes(1);
    if (buttonName === "Facturar") {
      expect(createAfipVoucherAction).toHaveBeenCalledTimes(1);
    }
    expect(processSaleAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Factura without valid CAE", { ...validCae, data: { ...validCae.data, cae: "invalid" } }, { success: true }],
    ["Factura whose sale persistence fails", validCae, { error: "sale save failed" }],
    ["Remito whose sale persistence fails", null, { error: "sale save failed" }],
  ])("does not request focus for %s", async (scenario, voucherResult, saveResult) => {
    const onSaleCreated = vi.fn();
    renderBillButtons({ onSaleCreated });
    if (voucherResult) {
      vi.mocked(createAfipVoucherAction).mockResolvedValue(voucherResult as never);
    }
    vi.mocked(processSaleAction).mockResolvedValue(saveResult as never);

    const isRemito = scenario.startsWith("Remito");
    fireEvent.click(screen.getByRole("button", { name: isRemito ? "Remito" : "Facturar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      if (scenario.includes("without valid CAE")) {
        expect(createAfipVoucherAction).toHaveBeenCalledTimes(1);
      } else {
        expect(processSaleAction).toHaveBeenCalledTimes(1);
      }
    });
    expect(onSaleCreated).not.toHaveBeenCalled();
  });

  it.each([
    ["new unpaid order", "Complete unpaid order creation"],
    ["append to an existing unpaid order", "Complete append to unpaid order"],
    ["Presupuesto", "Complete budget creation"],
  ])("requests focus exactly once after successful %s completion", async (_scenario, successControl) => {
    const onSaleCreated = vi.fn();
    const { billContext, handlePrint } = renderBillButtons({ onSaleCreated });

    fireEvent.click(
      screen.getByRole("button", {
        name: successControl === "Complete budget creation" ? "Presupuesto" : "A cuenta",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: successControl }));

    expect(onSaleCreated).toHaveBeenCalledTimes(1);
    expect(billContext.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "removeAll" }),
    );
    expect(billContext.dispatch.mock.invocationCallOrder[0]).toBeLessThan(
      onSaleCreated.mock.invocationCallOrder[0],
    );
    if (successControl === "Complete budget creation") {
      expect(handlePrint).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    ["failed unpaid-order action", "A cuenta", "Unpaid order action failed"],
    ["failed budget action", "Presupuesto", "Budget creation failed"],
  ])("does not request focus for a %s", async (_scenario, entryButton, failureControl) => {
    const onSaleCreated = vi.fn();
    renderBillButtons({ onSaleCreated });

    fireEvent.click(screen.getByRole("button", { name: entryButton }));
    fireEvent.click(await screen.findByRole("button", { name: failureControl }));

    expect(onSaleCreated).not.toHaveBeenCalled();
  });
});
