import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

const { getSalesAction, bind } = vi.hoisted(() => ({
  getSalesAction: vi.fn(),
  bind: vi.fn(),
}));
vi.mock("@/actions/sales/history", () => ({ getSalesAction }));
vi.mock("@/lib/pusher-client", () => ({
  pusherClient: {
    subscribe: vi.fn(() => ({ bind, unbind: vi.fn() })),
  },
}));
vi.mock("@/lib/utils/bill-type", () => ({ isAFIPAuthorized: () => false }));
vi.mock("@/components/Billing/SaleAccordion", () => ({
  default: ({ sale }: { sale: { id: string } }) => <div>{sale.id}</div>,
}));
vi.mock("@/components/Billing/PrintableTable", () => ({ default: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/context/FiltersContext/FiltersContext", async () => {
  const { createContext } = await import("react");
  return { FiltersContext: createContext(null) };
});

import SalesTable from "@/components/Billing/SalesTable";
import { FiltersContext } from "@/context/FiltersContext/FiltersContext";

const makeFiltersState = (sellerFilter: string | null) => ({
  Remito: { active: true },
  FacturaC: { active: true },
  Seller: { active: sellerFilter !== null, filter: sellerFilter ?? "" },
  startDate: { active: false, date: new Date() },
  endDate: { active: false, date: new Date() },
  Efectivo: { active: false },
  Debito: { active: false },
  UnPago: { active: false },
  Ahora3: { active: false },
  Ahora6: { active: false },
  Transferencia: { active: false },
  CuentaDNI: { active: false },
});

const sales = [
  {
    id: "own-paid-sale",
    seller: "seller@example.com",
    paidMethod: "Efectivo",
    date: new Date("2026-10-05T12:00:00"),
    totalWithDiscount: 10,
    total: 10,
    CAE: null,
  },
  {
    id: "other-paid-sale",
    seller: "other@example.com",
    paidMethod: "Efectivo",
    date: new Date("2026-10-05T11:00:00"),
    totalWithDiscount: 20,
    total: 20,
    CAE: null,
  },
] as never;

const renderForRole = (role: "ADMIN" | "SUPER_ADMIN" | "USER") => {
  const session = {
    user: { role, email: "seller@example.com", businessId: "business-1" },
  } as never;

  const Harness = () => {
    const [sellerFilter, setSellerFilter] = useState<string | null>(null);
    return (
      <FiltersContext.Provider
        value={{
          filtersState: makeFiltersState(sellerFilter),
          seller: (email: string) => setSellerFilter(email),
        }}
      >
        <SalesTable sales={sales} nextCursor={null} session={session} />
      </FiltersContext.Provider>
    );
  };

  return render(<Harness />);
};

describe("SalesTable role-based seller visibility", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    getSalesAction.mockResolvedValue({ sales, nextCursor: null });
  });

  it.each(["ADMIN", "SUPER_ADMIN"] as const)(
    "%s can see another seller's paid sale without an email env allowlist",
    async (role) => {
      const view = renderForRole(role);

      await waitFor(() => {
        expect(view.getByText("own-paid-sale")).toBeInTheDocument();
        expect(view.getByText("other-paid-sale")).toBeInTheDocument();
      });
    },
  );

  it("restricts USER visibility to the permitted seller", async () => {
    const view = renderForRole("USER");

    await waitFor(() => {
      expect(view.getByText("own-paid-sale")).toBeInTheDocument();
      expect(view.queryByText("other-paid-sale")).not.toBeInTheDocument();
    });
  });

  it("marks an initial sales error as an alert", () => {
    renderForRole("ADMIN").rerender(
      <FiltersContext.Provider value={{ filtersState: makeFiltersState(null), seller: vi.fn() }}>
        <SalesTable
          sales={[]}
          nextCursor={null}
          session={{ user: { role: "ADMIN", email: "admin@example.com", businessId: "business-1" } } as never}
          emptyState="No se pudieron cargar las ventas"
        />
      </FiltersContext.Provider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las ventas");
  });

  it("retains existing rows and marks a failed Pusher refresh", async () => {
    let updateHandler: (() => Promise<void>) | undefined;
    bind.mockImplementation((_event: string, handler: () => Promise<void>) => {
      updateHandler = handler;
    });
    getSalesAction.mockResolvedValue({
      sales: [],
      nextCursor: null,
      error: "No se pudieron cargar las ventas",
    });

    renderForRole("ADMIN");
    await act(async () => {
      await updateHandler?.();
    });

    expect(screen.getByText("own-paid-sale")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las ventas");
  });
});
