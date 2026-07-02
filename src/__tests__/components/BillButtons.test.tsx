import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BillButtonsDefault from "@/components/Billing/BillButtons";
import { BillContext } from "@/context/BillContext";
import { useFeatures } from "@/hooks/useFeatures";

vi.mock("@/hooks/useFeatures", () => ({
  useFeatures: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}));

vi.mock("@/context/CashboxContext", () => ({
  useCashbox: vi.fn(() => ({
    hasActiveSession: true,
    setHasActiveSession: vi.fn(),
    isClosing: false,
    setIsClosing: vi.fn(),
    isOpeningModalOpen: false,
    setIsOpeningModalOpen: vi.fn(),
  })),
}));

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: null,
    status: "unauthenticated",
  })),
}));

vi.mock("lucide-react", () => ({
  Lock: () => <svg data-testid="lock-icon" />,
  FileText: () => <svg data-testid="file-text-icon" />,
  Wallet: () => <svg data-testid="wallet-icon" />,
  CheckCircle: () => <svg data-testid="check-circle-icon" />,
  MessageCircle: () => <svg data-testid="message-circle-icon" />,
  Ban: () => <svg data-testid="ban-icon" />,
  Search: () => <svg data-testid="search-icon" />,
  User: () => <svg data-testid="user-icon" />,
  Plus: () => <svg data-testid="plus-icon" />,
  Loader2: () => <svg data-testid="loader-icon" />,
  Receipt: () => <svg data-testid="receipt-icon" />,
  Calculator: () => <svg data-testid="calculator-icon" />,
}));

vi.mock("@radix-ui/react-tooltip", () => ({
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Arrow: () => null,
}));

vi.mock("@/components/Billing/CheckoutModal", () => ({
  default: ({ open, onConfirm, type }: { open: boolean; onConfirm: () => void; type: string }) =>
    open ? (
      <button data-testid={`checkout-confirm-${type}`} onClick={onConfirm}>
        Confirmar {type}
      </button>
    ) : null,
}));

vi.mock("@/actions/afip", () => ({
  createAfipVoucherAction: vi.fn(),
}));

vi.mock("@/actions/sales", () => ({
  processSaleAction: vi.fn().mockResolvedValue({ success: true, orderId: "order-1" }),
  updateOrderAction: vi.fn(),
}));

const createMockBillContext = (productsCount = 1) => ({
  BillState: {
    id: "",
    products: Array.from({ length: productsCount }, (_, i) => ({
      id: `product-${i}`,
      code: `P00${i}`,
      description: `Product ${i}`,
      salePrice: 100,
      amount: 1,
      price: 100,
      unit: "un",
    })),
    total: productsCount * 100,
    totalWithDiscount: productsCount * 100,
    seller: "Test Seller",
    discount: 0,
    date: new Date(),
    typeDocument: "",
    documentNumber: 0,
    IVACondition: "",
    twoMethods: false,
  },
  dispatch: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
  onOrderResetRef: { current: null },
  printMode: "pdf" as const,
  setPrintMode: vi.fn(),
  qzTrayActive: false,
  setQzTrayActive: vi.fn(),
});

const mockSession = {
  user: {
    id: "user-1",
    email: "test@example.com",
    businessId: "business-123",
    name: "Test User",
    role: "ADMIN",
    businessName: "Test Business",
    businessSlug: "test-business",
    cashboxId: null,
    business: {
      name: "Test Business",
      slug: "test-business",
      accountStatus: "ACTIVO",
      features: { hasBudget: true, hasAfipBilling: true, plan: "ENTERPRISE" },
    },
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

describe("BillButtonsDefault - AFIP abort on feature disabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useFeatures).mockReturnValue({
      plan: "ENTERPRISE",
      hasFeature: () => true,
      isDelinquent: false,
      isPlanAtLeast: () => true,
      isOverLimit: () => false,
    } as any);
    // jsdom does not implement window.open, mock it
    window.open = vi.fn().mockReturnValue({
      document: { write: vi.fn() },
      close: vi.fn(),
    }) as unknown as typeof window.open;
  });

  it("should NOT call processSaleAction when createAfipVoucherAction fails (gate blocked modal)", async () => {
    const { createAfipVoucherAction } = await import("@/actions/afip");
    vi.mocked(createAfipVoucherAction).mockResolvedValue({
      error: "Función no habilitada",
    });

    const { processSaleAction } = await import("@/actions/sales");
    const mockCtx = createMockBillContext(2);

    const user = userEvent.setup();
    render(
      <BillContext.Provider value={mockCtx as any}>
        <BillButtonsDefault
          session={mockSession as never}
          handlePrint={vi.fn()}
        />
      </BillContext.Provider>,
    );

    // Click the Facturar button to open the checkout modal
    const facturarButton = screen.getByText("Facturar");
    await user.click(facturarButton);

    // Mock CheckoutModal appears — click confirm
    const confirmButton = screen.getByTestId("checkout-confirm-factura");
    await user.click(confirmButton);

    // Wait for async createSale to complete
    await waitFor(() => {
      expect(processSaleAction).not.toHaveBeenCalled();
    });

    // Blocked modal should appear with the feature-blocked title
    expect(screen.getByText("Funcionalidad no disponible")).toBeTruthy();
  });

  it("should call processSaleAction when createAfipVoucherAction succeeds (gate passes)", async () => {
    const { createAfipVoucherAction } = await import("@/actions/afip");
    vi.mocked(createAfipVoucherAction).mockResolvedValue({
      success: true,
      data: {
        CAE: "1234567890123",
        CAEFchVto: "2026-12-31",
        nroCbte: 1,
        qrData: "https://example.com/qr",
      },
    });

    const { processSaleAction } = await import("@/actions/sales");
    const mockCtx = createMockBillContext(2);

    const user = userEvent.setup();
    render(
      <BillContext.Provider value={mockCtx as any}>
        <BillButtonsDefault
          session={mockSession as never}
          handlePrint={vi.fn()}
        />
      </BillContext.Provider>,
    );

    // Click the Facturar button to open the checkout modal
    const facturarButton = screen.getByText("Facturar");
    await user.click(facturarButton);

    // Mock CheckoutModal appears — click confirm
    const confirmButton = screen.getByTestId("checkout-confirm-factura");
    await user.click(confirmButton);

    // Wait for async createSale to complete and call processSaleAction
    await waitFor(() => {
      expect(processSaleAction).toHaveBeenCalled();
    });

    // Blocked modal should NOT appear (gate passed)
    expect(screen.queryByText("Funcionalidad no disponible")).toBeNull();
  });
});
