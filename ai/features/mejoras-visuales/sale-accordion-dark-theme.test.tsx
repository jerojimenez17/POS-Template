import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SaleAccordion from "@/components/Billing/SaleAccordion";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/actions/sales/update", () => ({ deleteOrderAction: vi.fn() }));
vi.mock("@/utils/date", () => ({ formatLocalDate: vi.fn(() => "01/01/2025") }));
vi.mock("@/lib/utils/bill-type", () => ({ formatInvoiceNumberFull: vi.fn(() => "0001-00000001") }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/Billing/BillingModal", () => ({ default: () => null }));
vi.mock("@/components/Billing/PrintOptionsPopover", () => ({ default: () => <button aria-label="Imprimir" /> }));
vi.mock("@/components/DeleteButton", () => ({ default: ({ onClick }: { onClick: (event: React.MouseEvent) => void }) => <button aria-label="Eliminar" onClick={onClick} /> }));
vi.mock("@/components/Modal", () => ({ default: () => null }));
vi.mock("lucide-react", () => ({ Eye: () => <span /> }));

describe("SaleAccordion dark theme visual contract", () => {
  it("provides dark surface, hover/focus states, and contrasting Facturar control", () => {
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

    const row = screen.getByText("Efectivo").closest("div")?.parentElement?.parentElement;
    const invoiceButton = screen.getByRole("button", { name: "Facturar" });

    expect(row).toHaveClass("bg-white", "dark:bg-gray-800", "hover:bg-gray-50", "dark:hover:bg-gray-700");
    expect(row).toHaveClass("border-gray-100", "dark:border-gray-700");
    expect(invoiceButton).toHaveClass("dark:bg-blue-900/30", "dark:text-blue-300", "focus-visible:ring-2");
  });
});
