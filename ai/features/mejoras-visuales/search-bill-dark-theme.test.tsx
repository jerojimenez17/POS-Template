import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SalesTable from "@/components/Billing/SalesTable";

vi.mock("@/context/FiltersContext/FiltersContext", async () => {
  const { createContext } = await import("react");
  const field = { active: false, filter: "", date: new Date(0) };
  return {
    FiltersContext: createContext({
      filtersState: {
        FacturaC: field,
        Remito: field,
        Debito: field,
        UnPago: field,
        Ahora3: field,
        Ahora6: field,
        Transferencia: field,
        Efectivo: field,
        CuentaDNI: field,
        Seller: field,
        startDate: { active: false, date: new Date(0) },
        endDate: { active: false, date: new Date(0) },
      },
      seller: vi.fn(),
    }),
  };
});

vi.mock("@/components/Billing/SaleAccordion", () => ({
  default: ({ sale }: { sale: { id: string } }) => <div data-testid={`sale-${sale.id}`} />,
}));
vi.mock("@/components/Billing/PrintableTable", () => ({ default: () => null }));
vi.mock("@/lib/pusher-client", () => ({
  pusherClient: { subscribe: vi.fn(() => ({ bind: vi.fn(), unbind: vi.fn() })) },
}));
vi.mock("@/actions/sales", () => ({ getSalesAction: vi.fn() }));
vi.mock("@/lib/utils/bill-type", () => ({ isAFIPAuthorized: vi.fn(() => true) }));
vi.mock("lucide-react", () => ({
  ChevronLeft: () => <span />, ChevronRight: () => <span />, ChevronDown: () => <span />,
  Eye: () => <span />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button className={className} {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => <button className={className}>{children}</button>,
  SelectValue: () => <span />,
  SelectContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("searchBill: dark theme visual contract", () => {
  it("uses semantic light/dark surfaces and text for the table summary and pagination", () => {
    render(<SalesTable sales={[]} nextCursor={null} session={null} />);

    const root = screen.getByText(/Total:/).closest("div.flex");
    const pagination = screen.getByText(/Filas por página:/).parentElement?.parentElement;

    expect(root).toHaveClass("text-gray-900", "dark:text-gray-100");
    expect(root).not.toHaveClass("text-black");
    expect(screen.getByText(/Total:/)).toHaveClass("text-gray-900", "dark:text-gray-100");
    expect(pagination).toHaveClass("bg-white", "dark:bg-gray-800");
    expect(screen.getByText(/Filas por página:/)).toHaveClass("text-gray-700", "dark:text-gray-300");
  });

  it("keeps the empty state and header readable in both themes", () => {
    render(<SalesTable sales={[]} nextCursor={null} session={null} />);

    expect(screen.getByText("Fecha").parentElement).toHaveClass("text-gray-500", "dark:text-gray-400");
    expect(screen.getByText(/No se encontraron ventas/)).toHaveClass("text-gray-500", "dark:text-gray-400");
  });
});
