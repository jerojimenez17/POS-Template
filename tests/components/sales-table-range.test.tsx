import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSalesAction, bind, subscribe } = vi.hoisted(() => {
  const handlers = new Map<string, () => Promise<void>>();
  const channel = {
    bind: vi.fn((event: string, handler: () => Promise<void>) => handlers.set(event, handler)),
    unbind: vi.fn(),
  };
  return {
    getSalesAction: vi.fn(),
    bind: handlers,
    subscribe: vi.fn(() => channel),
  };
});

vi.mock("@/actions/sales/get-sales", () => ({ getSalesAction }));
vi.mock("@/lib/pusher-client", () => ({ pusherClient: { subscribe } }));
vi.mock("@/lib/utils/bill-type", () => ({ isAFIPAuthorized: () => false }));
vi.mock("@/context/FiltersContext/FiltersContext", () => ({
  FiltersContext: { _currentValue: {
    filtersState: {
      Remito: { active: true }, FacturaC: { active: true }, Seller: { active: false },
       startDate: { active: false, date: new Date() }, endDate: { active: true, date: new Date("2026-10-05T23:59:59.999") },
      Efectivo: { active: false }, Debito: { active: false }, UnPago: { active: false },
      Ahora3: { active: false }, Ahora6: { active: false }, Transferencia: { active: false }, CuentaDNI: { active: false },
    },
    seller: vi.fn(),
  } },
}));
vi.mock("@/components/Billing/SaleAccordion", () => ({ default: ({ sale }: { sale: { id: string } }) => <div>{sale.id}</div> }));
vi.mock("@/components/Billing/PrintableTable", () => ({ default: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import SalesTable from "@/components/Billing/SalesTable";

const sale = { id: "first", date: new Date("2026-10-05T12:00:00"), totalWithDiscount: 10, total: 10, seller: "Ana", paidMethod: "Efectivo", CAE: null } as never;

describe("SalesTable server-filter continuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bind.clear();
    getSalesAction.mockResolvedValue({ sales: [], nextCursor: null });
  });

  it("keeps the range for cursor pagination and Pusher refresh", async () => {
    const query = { from: "2026-10-01", to: "2026-10-05" };
    getSalesAction.mockResolvedValueOnce({ sales: [{ ...sale, id: "second" }], nextCursor: null });
    const { getByText } = render(
      <SalesTable sales={[sale]} nextCursor="cursor-1" session={{ user: { businessId: "business-1", email: "ana@example.com" } } } salesQuery={query} />,
    );

    fireEvent.click(getByText("Cargar más"));
    await waitFor(() => expect(getSalesAction).toHaveBeenCalledWith({ ...query, cursor: "cursor-1" }));

    getSalesAction.mockResolvedValueOnce({ sales: [sale], nextCursor: "cursor-2" });
    await bind.get("orders-update")?.();
    expect(getSalesAction).toHaveBeenLastCalledWith(query);
  });

  it("keeps a noon sale visible when the active report end date is the final day", () => {
    const { getByText } = render(
      <SalesTable sales={[sale]} nextCursor={null} session={null} />,
    );

    expect(getByText("first")).toBeInTheDocument();
  });

  it("deduplicates sales returned by cursor pagination", async () => {
    getSalesAction.mockResolvedValueOnce({ sales: [sale], nextCursor: null });
    const { getByText, queryAllByText } = render(
      <SalesTable sales={[sale]} nextCursor="cursor-1" session={null} />,
    );

    fireEvent.click(getByText("Cargar más"));
    await waitFor(() => expect(queryAllByText("first")).toHaveLength(1));
  });

  it("distinguishes an action error from a genuinely empty filtered result", () => {
    const { rerender, getByRole, queryByText } = render(
      <SalesTable sales={[]} nextCursor={null} session={null} emptyState="No se pudieron cargar las ventas." />,
    );

    expect(getByRole("alert")).toHaveTextContent("No se pudieron cargar las ventas.");

    rerender(<SalesTable sales={[]} nextCursor={null} session={null} />);
    expect(queryByText("No hay ventas que coincidan con los filtros activos.")).toBeInTheDocument();
  });
});
