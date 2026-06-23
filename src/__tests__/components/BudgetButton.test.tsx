import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import BillButtonsDefault from "@/components/Billing/BillButtons";

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
}));

vi.mock("@radix-ui/react-tooltip", () => ({
  Provider: ({ children }: { children: React.ReactNode }) => children,
  Root: ({ children }: { children: React.ReactNode }) => children,
  Trigger: ({ children }: { children: React.ReactNode }) => children,
  Content: ({ children }: { children: React.ReactNode }) => children,
  Portal: ({ children }: { children: React.ReactNode }) => children,
  Arrow: () => null,
}));

const createMockBillContext = (productsCount = 0) => ({
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

interface MockBusiness {
  name: string;
  slug: string;
  accountStatus: string;
  features: Record<string, boolean | string | number>;
}

interface MockSession {
  user: {
    id: string;
    email: string;
    businessId: string;
    name: string;
    role: string;
    businessName: string;
    businessSlug: string;
    cashboxId: string | null;
    business: MockBusiness;
  };
  expires: string;
}

const createSession = (hasBudget: boolean): MockSession => ({
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
      features: { hasBudget, plan: hasBudget ? "ENTERPRISE" : "BASIC" },
    },
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
});

describe("BudgetButton in BillButtonsDefault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the Presupuesto button when hasBudget is enabled", () => {
    const { BillContext } = require("@/context/BillContext");
    const mockCtx = createMockBillContext(2);

    render(
      <BillContext.Provider value={mockCtx}>
        <BillButtonsDefault
          session={createSession(true) as never}
          handlePrint={vi.fn()}
        />
      </BillContext.Provider>,
    );

    expect(screen.queryByText("Presupuesto")).not.toBeNull();
  });

  it("should NOT render the Presupuesto button when hasBudget is disabled", () => {
    const { BillContext } = require("@/context/BillContext");
    const mockCtx = createMockBillContext(2);

    render(
      <BillContext.Provider value={mockCtx}>
        <BillButtonsDefault
          session={createSession(false) as never}
          handlePrint={vi.fn()}
        />
      </BillContext.Provider>,
    );

    expect(screen.queryByText("Presupuesto")).toBeNull();
  });
});
