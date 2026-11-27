import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SaleAccordion from "@/components/Billing/SaleAccordion";

// Merged component (report-D): our compact 6-column grid row won over Jero's card-per-row
// design; it navigates via router.push and renders PrintOptionsPopover + inline admin
// delete (Trash2) + Facturar chip + InvoiceModal. Mocks below mirror that import graph.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/actions/sales/update", () => ({ deleteOrderAction: vi.fn() }));
vi.mock("@/utils/date", () => ({ formatLocalDate: vi.fn(() => "01/01/2025") }));
vi.mock("@/lib/utils/bill-type", () => ({ formatInvoiceNumberFull: vi.fn(() => "0001-00000001") }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// InvoiceModal pulls feature-blocked-modal → lucide-react icons; stub the whole subtree.
vi.mock("@/components/Billing/InvoiceModal", () => ({ default: () => null }));
vi.mock("@/components/Billing/PrintOptionsPopover", () => ({ default: () => <button aria-label="Imprimir" /> }));

describe("SaleAccordion dark theme visual contract", () => {
  it("renders OUR merged row contract: transparent dark-safe row over page background", () => {
    render(
      <SaleAccordion
        session={null}
        qzTrayEnabled={false}
        sale={{
          id: "sale-1", products: [], total: 100, totalWithDiscount: 100,
          seller: "seller@example.com", discount: 0, date: new Date("2025-01-01"),
          typeDocument: "", documentNumber: 1, IVACondition: "", twoMethods: false,
          paidMethod: "Efectivo",
        }}
      />,
    );

    // Payment-method cell's direct parent is the row grid container in our layout.
    const row = screen.getByText("Efectivo").parentElement;
    expect(row).not.toBeNull();

    // OUR row design (kept over Jero's card-per-row in report-D):
    // - compact 6-col grid with a single 90px actions column
    expect(row).toHaveClass("grid-cols-[2fr_2fr_2fr_3fr_2fr_90px]");
    // - transparent row + dark hover pair (dark-safe without a card surface)
    expect(row).toHaveClass("hover:bg-gray-50", "dark:hover:bg-gray-800/30");
    // - typography dark pair
    expect(row).toHaveClass("text-gray-700", "dark:text-gray-300");
    // - mobile strategy: fixed logical width + horizontal scroll (~700px effective)
    expect(row).toHaveClass("w-[700px]", "sm:w-full", "min-w-max");

    // JERO_UI_DISCARDED card-per-row treatment must NOT be asserted/present:
    expect(row!.className).not.toContain("bg-white");
    expect(row!.className).not.toContain("border-gray-100");
    expect(row!.className).not.toContain("dark:border-gray-700");
  });

  it("provides contrasting Facturar control with dark/focus tokens (JERO_UI_ADOPTED)", () => {
    render(
      <SaleAccordion
        session={null}
        sale={{
          id: "sale-1", products: [], total: 100, totalWithDiscount: 100,
          seller: "seller@example.com", discount: 0, date: new Date("2025-01-01"),
          typeDocument: "", documentNumber: 1, IVACondition: "", twoMethods: false,
          paidMethod: "Efectivo",
        }}
      />,
    );

    const invoiceButton = screen.getByRole("button", { name: "Facturar" });
    // Dark surface chips + hover pair + blue focus ring grafted onto OUR button shape.
    expect(invoiceButton).toHaveClass(
      "bg-blue-50",
      "text-blue-600",
      "dark:bg-blue-900/30",
      "dark:text-blue-300",
      "dark:hover:bg-blue-800",
      "dark:hover:text-blue-100",
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-blue-500",
    );
  });
});
