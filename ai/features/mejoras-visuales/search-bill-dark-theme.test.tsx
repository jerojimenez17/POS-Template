import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SalesTable from "@/components/Billing/SalesTable";

const { filtersState, resetFilters } = vi.hoisted(() => {
  const createField = () => ({ active: false, filter: "", date: new Date(0) });
  const filtersState = {
    FacturaC: createField(),
    Remito: createField(),
    Debito: createField(),
    UnPago: createField(),
    Ahora3: createField(),
    Ahora6: createField(),
    Transferencia: createField(),
    Efectivo: createField(),
    CuentaDNI: createField(),
    Seller: createField(),
    startDate: { active: false, date: new Date(0) },
    endDate: { active: false, date: new Date(0) },
  };

  return {
    filtersState,
    resetFilters: () => {
      Object.values(filtersState).forEach((field) => {
        field.active = false;
        if ("filter" in field) field.filter = "";
      });
    },
  };
});

vi.mock("@/context/FiltersContext/FiltersContext", async () => {
  const { createContext } = await import("react");
  return {
    FiltersContext: createContext({
      filtersState,
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
vi.mock("@/lib/utils/bill-type", () => ({ isAFIPAuthorized: vi.fn((_type: unknown, cae: unknown) => Boolean(cae)) }));
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
  beforeEach(() => {
    resetFilters();
  });

  it("uses semantic light/dark surfaces and text for the table summary and pagination", () => {
    render(<SalesTable sales={[]} nextCursor={null} session={null} />);

    // Merged summary = OUR compact bar (report-D): label + mono amount spans
    // inside the card header; the table header cell also reads "Total", so
    // scope to spans (summary uses spans, header uses a div).
    const totalLabel = screen.getByText("Total", { selector: "span" });
    expect(totalLabel).toHaveClass("text-gray-600", "dark:text-gray-400");
    const amount = totalLabel.nextElementSibling;
    expect(amount).toHaveClass("text-gray-900", "dark:text-gray-100");

    // Pagination stays a plain strip (Jero's carded pagination was discarded);
    // labels carry the adopted dark pair for AA contrast outside the card.
    const rowsLabel = screen.getByText(/Filas por página:/);
    expect(rowsLabel).toHaveClass("text-gray-500", "dark:text-gray-400");
    expect(rowsLabel.parentElement?.parentElement).not.toHaveClass("bg-white");
  });

  it("keeps the empty state and header readable in both themes", () => {
    render(<SalesTable sales={[]} nextCursor={null} session={null} />);

    expect(screen.getByText("Fecha").parentElement).toHaveClass("text-gray-500", "dark:text-gray-400");
    const emptyState = screen.getByText("No hay ventas que coincidan con los filtros activos.");
    expect(emptyState).toBeVisible();
    expect(emptyState).toHaveClass("text-gray-500", "dark:text-gray-400");
  });

  it("shows a genuine visible empty result when an active filter excludes the sale", () => {
    filtersState.Remito.active = true;
    filtersState.Remito.filter = "Remito";

    const sale = {
      id: "factura-sale",
      products: [],
      total: 100,
      totalWithDiscount: 100,
      seller: "Ana",
      discount: 0,
      date: new Date("2026-10-05T12:00:00"),
      typeDocument: "Factura",
      CAE: { CAE: "12345678901234" },
      documentNumber: 1,
      IVACondition: "Consumidor Final",
      twoMethods: false,
    };

    render(<SalesTable sales={[sale]} nextCursor={null} session={null} />);

    const emptyState = screen.getByText("No hay ventas que coincidan con los filtros activos.");
    expect(emptyState).toBeVisible();
    expect(emptyState).not.toHaveAttribute("role", "alert");
    expect(screen.queryByTestId("sale-factura-sale")).not.toBeInTheDocument();
  });

  it("keeps a server error alert distinct from a genuine filtered empty result", () => {
    filtersState.Remito.active = true;
    filtersState.Remito.filter = "Remito";

    const sale = {
      id: "factura-sale",
      products: [],
      total: 100,
      totalWithDiscount: 100,
      seller: "Ana",
      discount: 0,
      date: new Date("2026-10-05T12:00:00"),
       typeDocument: "Factura",
       CAE: { CAE: "12345678901234" },
      documentNumber: 1,
      IVACondition: "Consumidor Final",
      twoMethods: false,
    };

    const { rerender } = render(<SalesTable sales={[sale]} nextCursor={null} session={null} />);
    expect(screen.getByText("No hay ventas que coincidan con los filtros activos.")).not.toHaveAttribute("role", "alert");

    rerender(
      <SalesTable
        sales={[]}
        nextCursor={null}
        session={null}
        emptyState="No se pudieron cargar las ventas."
      />,
    );

    const error = screen.getByRole("alert");
    expect(error).toBeVisible();
    expect(error).toHaveTextContent("No se pudieron cargar las ventas.");
  });
});
