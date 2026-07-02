import React from "react";
import { screen, render } from "../test-utils";
import PrintableTable from "@/components/Billing/PrintableTable";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFeatures } from "@/hooks/useFeatures";

vi.mock("next/font/google", () => ({
  Inter: () => ({ className: "inter-class", variable: "--font-inter" }),
}));

vi.mock("@/hooks/useFeatures", () => ({
  useFeatures: vi.fn(),
}));

vi.mock("@/actions/stock", () => ({
  getProductByCode: vi.fn(),
  getProductsByCode: vi.fn(),
  getProductsBySearch: vi.fn(),
  getSuppliersForFilter: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/actions/business", () => ({
  getBusinessBillingInfoAction: vi.fn(),
}));

vi.mock("@/lib/print", () => ({
  printThermalReceipt: vi.fn(),
  exportToPDF: vi.fn(),
  buildPDFHTML: vi.fn(),
  PDF_STYLES: "",
}));

const defaultProps = {
  printTrigger: 0,
  className: "",
  handleClose: vi.fn(),
  session: {
    user: {
      id: "test-user-id",
      name: "Test User",
      email: "test@example.com",
      businessId: "test-business-id",
      businessName: "Test Business",
    },
    expires: new Date(Date.now() + 86400).toISOString(),
  },
};

describe("PrintableTable supplier filter feature gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show supplier filter control when hasSupplierFilter is true", () => {
    vi.mocked(useFeatures).mockReturnValue({
      plan: "PRO",
      hasFeature: (key: string) => key === "hasSupplierFilter",
      isDelinquent: false,
      isOverLimit: () => false,
      isPlanAtLeast: () => true,
    } as any);

    render(<PrintableTable {...defaultProps} />, {
      sessionMock: defaultProps.session,
    });

    expect(screen.getByText("Todos los proveedores")).toBeInTheDocument();
  });

  it("should hide supplier filter control when hasSupplierFilter is false", () => {
    vi.mocked(useFeatures).mockReturnValue({
      plan: "BASIC",
      hasFeature: () => false,
      isDelinquent: false,
      isOverLimit: () => false,
      isPlanAtLeast: () => false,
    } as any);

    render(<PrintableTable {...defaultProps} />, {
      sessionMock: defaultProps.session,
    });

    expect(
      screen.queryByText("Todos los proveedores")
    ).not.toBeInTheDocument();
  });
});
