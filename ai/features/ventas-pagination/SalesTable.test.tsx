import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type BillState from "@/models/BillState";
import { FiltersContext } from "@/context/FiltersContext/FiltersContext";

const { getSalesMock, subscribeMock, bindMock, unbindMock } = vi.hoisted(() => ({
  getSalesMock: vi.fn(), subscribeMock: vi.fn(), bindMock: vi.fn(), unbindMock: vi.fn(),
}));
vi.mock("@/actions/sales/get-sales", () => ({ getSalesAction: getSalesMock }));
vi.mock("@/lib/pusher-client", () => ({ pusherClient: { subscribe: subscribeMock } }));
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "" }) }));
vi.mock("./SaleAccordion", () => ({ default: ({ sale }: { sale: BillState }) => <div>{sale.id}</div> }));
vi.mock("./PrintableTable", () => ({ default: () => null }));
vi.mock("@/components/Billing/PrintableTable", () => ({ default: () => null }));

import SalesTable from "@/components/Billing/SalesTable";

const sale = (id: string): BillState => ({ id, date: new Date(), totalWithDiscount: 1, paidMethod: "efectivo", CAE: undefined } as unknown as BillState);
const baseFilters = {
  Remito: { active: true, filter: "remito" }, FacturaC: { active: false, filter: "facturac" },
  Debito: { active: false, filter: "debito" }, UnPago: { active: false, filter: "Credito 1 pago" },
  Ahora3: { active: false, filter: "ahora 3" }, Ahora6: { active: false, filter: "ahora 6" },
  Transferencia: { active: false, filter: "transferencia" }, CuentaDNI: { active: false, filter: "cuentaDNI" },
  Efectivo: { active: true, filter: "efectivo" }, Seller: { active: false, filter: "" },
  startDate: { active: false, date: new Date() }, endDate: { active: false, date: new Date() },
};

function renderTable(filtersState = baseFilters) {
  const context = { filtersState, seller: vi.fn() } as never;
  const session = { user: { businessId: "business-a", email: "admin@example.com" } } as never;
  return render(<FiltersContext.Provider value={context}><SalesTable sales={[sale("one")]} nextCursor="cursor-1" session={session} /></FiltersContext.Provider>);
}

describe("SalesTable pagination state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSalesMock.mockResolvedValue({ sales: [sale("two")], nextCursor: "cursor-2" });
    subscribeMock.mockReturnValue({ bind: bindMock, unbind: unbindMock });
  });

  it("restarts at page 1 with no cursor and new serialized filters when a filter changes", async () => {
    const nextFilters = { ...baseFilters, Seller: { active: true, filter: "Ana" } } as never;
    const { rerender } = renderTable();
    rerender(<FiltersContext.Provider value={{ filtersState: nextFilters, seller: vi.fn() } as never}><SalesTable sales={[sale("one")]} nextCursor="cursor-1" session={null} /></FiltersContext.Provider>);
    await waitFor(() => expect(getSalesMock).toHaveBeenCalledWith(expect.objectContaining({ cursor: undefined, filters: expect.anything() })));
    expect(screen.getByText(/Página 1/)).toBeInTheDocument();
  });

  it("loads more with the exact visible cursor and the same filter snapshot", async () => {
    renderTable();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /cargar más/i })); });
    expect(getSalesMock).toHaveBeenCalledWith(expect.objectContaining({ cursor: "cursor-1", filters: expect.anything() }));
    expect(screen.getByText("two")).toBeInTheDocument();
  });

  it("deduplicates ids when appending and hides loading when nextCursor is null", async () => {
    getSalesMock.mockResolvedValueOnce({ sales: [sale("one"), sale("two")], nextCursor: null });
    renderTable();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /cargar más/i })); });
    expect(screen.getAllByText("one")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /cargar más/i })).not.toBeInTheDocument();
  });

  it("ignores a stale response from an older filter snapshot", async () => {
    let resolveOld!: (value: unknown) => void;
    getSalesMock.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    const { rerender } = renderTable();
    rerender(<FiltersContext.Provider value={{ filtersState: { ...baseFilters, Seller: { active: true, filter: "Ana" } }, seller: vi.fn() } as never}><SalesTable sales={[]} nextCursor={null} session={null} /></FiltersContext.Provider>);
    await act(async () => { resolveOld({ sales: [sale("stale")], nextCursor: "bad" }); });
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
  });

  it("refreshes Pusher from the first page using active filters and resets the cursor", async () => {
    renderTable();
    await waitFor(() => expect(bindMock).toHaveBeenCalled());
    const handler = bindMock.mock.calls[0][1] as () => Promise<void>;
    getSalesMock.mockResolvedValueOnce({ sales: [sale("fresh")], nextCursor: "fresh-cursor" });
    await act(handler);
    expect(getSalesMock).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: undefined, filters: expect.anything() }));
    expect(screen.getByText("fresh")).toBeInTheDocument();
  });
});
