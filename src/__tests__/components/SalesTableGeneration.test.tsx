import type { ReactNode } from "react";
import type { Session } from "next-auth";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FiltersContext } from "@/context/FiltersContext/FiltersContext";
import type FiltersState from "@/models/FiltersState";
import type BillState from "@/models/BillState";
import SalesTable from "@/components/Billing/SalesTable";

const { getSalesMock, pusherState } = vi.hoisted(() => ({
  getSalesMock: vi.fn(),
  pusherState: { handlers: {} as Record<string, () => Promise<void> | void> },
}));

vi.mock("@/actions/sales/get-sales", () => ({ getSalesAction: getSalesMock }));
vi.mock("@/lib/pusher-client", () => ({
  pusherClient: {
    subscribe: vi.fn(() => ({
      bind: vi.fn((event: string, handler: () => Promise<void> | void) => { pusherState.handlers[event] = handler; }),
      unbind: vi.fn(),
    })),
  },
}));
vi.mock("@/components/Billing/SaleAccordion", () => ({
  default: ({ sale }: { sale: BillState }) => <article data-testid="sale-row">{sale.id}</article>,
}));
vi.mock("@/components/Billing/PrintableTable", () => ({ default: () => null }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  SelectValue: () => <span>10</span>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
vi.mock("lucide-react", () => ({ ChevronLeft: () => null, ChevronRight: () => null, ChevronDown: () => null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function saleRow(id: string, amount: number): BillState {
  return {
    id,
    products: [],
    total: amount,
    totalWithDiscount: amount,
    seller: "Seller",
    discount: 0,
    date: new Date("2026-04-20T12:00:00.000Z"),
    typeDocument: "",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    twoMethods: false,
    paidMethod: "Efectivo",
  };
}

const initialSales = [saleRow("initial-sale", 10)];

function filters(activeInvoice = false): FiltersState {
  const field = { active: false, filter: "" };
  return {
    FacturaC: { ...field, active: activeInvoice },
    Remito: { ...field },
    Debito: { ...field },
    UnPago: { ...field },
    Ahora3: { ...field },
    Ahora6: { ...field },
    Transferencia: { ...field },
    CuentaDNI: { ...field },
    Efectivo: { ...field },
    Seller: { ...field },
    startDate: { active: false, date: new Date("2026-01-01T00:00:00.000Z") },
    endDate: { active: false, date: new Date("2026-12-31T00:00:00.000Z") },
  };
}

function renderTable(filtersState: FiltersState) {
  return render(
    <FiltersContext.Provider value={{ filtersState, seller: vi.fn() } as never}>
      <SalesTable
        sales={initialSales}
        nextCursor="initial-cursor"
        session={{ user: { businessId: "business-1" } } as Session}
      />
    </FiltersContext.Provider>,
  );
}

describe("SalesTable request generations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSalesMock.mockReset();
    pusherState.handlers = {};
  });

  it("starts the initial search with no document or payment restrictions", async () => {
    getSalesMock.mockResolvedValueOnce({
      sales: [saleRow("cae-invoice", 20), saleRow("no-cae-remito", 10)],
      nextCursor: null,
    });

    render(
      <FiltersContext.Provider value={{ filtersState: filters(), seller: vi.fn() } as never}>
        <SalesTable
          sales={[]}
          nextCursor={null}
          session={{ user: { businessId: "business-1" } } as Session}
        />
      </FiltersContext.Provider>,
    );

    await waitFor(() => expect(getSalesMock).toHaveBeenCalledWith({
      cursor: undefined,
      filters: { documentTypes: [], paymentMethods: [] },
    }));
    expect(await screen.findByText("cae-invoice")).toBeInTheDocument();
    expect(screen.getByText("no-cae-remito")).toBeInTheDocument();
  });

  it("discards a load-more response after Pusher replaces the dataset", async () => {
    const oldPage = deferred<{ sales: BillState[]; nextCursor: string | null }>();
    getSalesMock.mockReturnValueOnce(oldPage.promise).mockResolvedValueOnce({
      sales: [saleRow("pusher-sale", 25)],
      nextCursor: "pusher-cursor",
    }).mockResolvedValueOnce({ sales: [], nextCursor: null });
    renderTable(filters());

    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(getSalesMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ cursor: "initial-cursor" }));

    const pusherRefresh = pusherState.handlers["orders-update"];
    expect(pusherRefresh).toBeDefined();
    await act(async () => { await pusherRefresh?.(); });
    await waitFor(() => expect(screen.getAllByText("pusher-sale").length).toBeGreaterThan(0));

    await act(async () => {
      oldPage.resolve({ sales: [saleRow("stale-page-sale", 900)], nextCursor: "stale-cursor" });
      await oldPage.promise;
    });

    expect(screen.queryByText("stale-page-sale")).not.toBeInTheDocument();
    expect(screen.getAllByText("pusher-sale").length).toBeGreaterThan(0);
    expect(screen.getByText(/Total: \$25,00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(getSalesMock).toHaveBeenNthCalledWith(3, expect.objectContaining({ cursor: "pusher-cursor" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument());
  });

  it("does not let an obsolete finally clear a newer generation's loading state", async () => {
    const firstGenerationPage = deferred<{ sales: BillState[]; nextCursor: string | null }>();
    const refreshedGenerationPage = deferred<{ sales: BillState[]; nextCursor: string | null }>();
    getSalesMock.mockReturnValueOnce(firstGenerationPage.promise)
      .mockResolvedValueOnce({ sales: [saleRow("filtered-sale", 20)], nextCursor: "filtered-cursor" })
      .mockReturnValueOnce(refreshedGenerationPage.promise);
    const initialFilters = filters();
    const view = renderTable(initialFilters);

    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    view.rerender(
      <FiltersContext.Provider value={{ filtersState: filters(true), seller: vi.fn() } as never}>
        <SalesTable
          sales={initialSales}
          nextCursor="initial-cursor"
          session={{ user: { businessId: "business-1" } } as Session}
        />
      </FiltersContext.Provider>,
    );
    await waitFor(() => expect(getSalesMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("filtered-sale")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(screen.getByRole("button", { name: "Cargando..." })).toBeDisabled();

    await act(async () => {
      firstGenerationPage.resolve({ sales: [saleRow("stale-sale", 50)], nextCursor: "stale-cursor" });
      await firstGenerationPage.promise;
    });

    expect(screen.getByRole("button", { name: "Cargando..." })).toBeDisabled();
    expect(screen.queryByText("stale-sale")).not.toBeInTheDocument();

    await act(async () => {
      refreshedGenerationPage.resolve({ sales: [saleRow("filtered-next-page", 5)], nextCursor: null });
      await refreshedGenerationPage.promise;
    });
    expect(screen.getByText("filtered-next-page")).toBeInTheDocument();
  });
});
