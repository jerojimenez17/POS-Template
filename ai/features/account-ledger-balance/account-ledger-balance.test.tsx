import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountLedgerPage } from "@/actions/unpaid-orders";

const { getUnpaidOrdersMock } = vi.hoisted(() => ({ getUnpaidOrdersMock: vi.fn() }));

vi.mock("@/actions/unpaid-orders", () => ({ getUnpaidOrders: getUnpaidOrdersMock }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}));
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
vi.mock("@/components/ui/LocalDate", () => ({ LocalDate: () => <span>01/01/2026</span> }));
vi.mock("@/components/ui/OverdueIndicator", () => ({ OverdueIndicator: () => <span /> }));
vi.mock("@/utils/overdue", () => ({ isOrderOverdue: () => false }));
vi.mock("./ConfirmOrderButton", () => ({ default: () => <button>Confirmar</button> }));

import AccountLedgerList from "@/app/(protected)/account-ledger/AccountLedgerList";

interface LedgerFixture {
  id: string;
  total: number;
  client: { id: string; name: string | null; balance: number } | null;
  paidStatus?: string;
}

const page = (fixtures: LedgerFixture[]): AccountLedgerPage => ({
  orders: fixtures.map((fixture) => ({
    id: fixture.id,
    date: new Date("2026-01-01T00:00:00.000Z"),
    total: fixture.total,
    status: "confirmado",
    paidStatus: fixture.paidStatus ?? "inpago",
    clientId: fixture.client?.id ?? null,
    client: fixture.client,
    notes: null,
  })),
  nextCursor: null,
  hasMore: false,
});

const balanceText = (row: HTMLElement): string =>
  within(row).getAllByRole("cell")[2].textContent ?? "";

describe("AccountLedgerList current client balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      disconnect() {}
    });
    getUnpaidOrdersMock.mockResolvedValue({ success: true, data: { orders: [], nextCursor: null, hasMore: false } });
  });

  it.each(["inpago", "pago", "pendiente", "all"])(
    "shows the Saldo de cuenta column immediately after Total on the %s tab",
    (status) => {
      render(<AccountLedgerList status={status} initialPage={page([{
        id: "order-a", total: 89, client: { id: "client-a", name: "Ana", balance: 1250.5 },
      }])} />);

      const headers = screen.getAllByRole("columnheader").map((header) => header.textContent?.trim());
      expect(headers.filter((header) => header === "Saldo de cuenta")).toHaveLength(1);
      expect(headers.indexOf("Saldo de cuenta")).toBe(headers.indexOf("Total") + 1);
    },
  );

  it("renders the current client balance instead of the order total, repeating the same balance for that client", () => {
    render(<AccountLedgerList status="inpago" initialPage={page([
      { id: "order-a", total: 89, client: { id: "client-a", name: "Ana", balance: 1250.5 } },
      { id: "order-b", total: 4200, client: { id: "client-a", name: "Ana", balance: 1250.5 } },
    ])} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(balanceText(rows[0])).toContain((1250.5).toLocaleString("es-AR"));
    expect(balanceText(rows[1])).toBe(balanceText(rows[0]));
    expect(balanceText(rows[0])).not.toContain((89).toLocaleString("es-AR"));
    expect(balanceText(rows[1])).not.toContain((4200).toLocaleString("es-AR"));
    expect(balanceText(rows[0])).toContain("$");
  });

  it("preserves positive, zero and negative balances and marks a missing client as unavailable", () => {
    render(<AccountLedgerList status="all" initialPage={page([
      { id: "positive", total: 1, client: { id: "a", name: "Ana", balance: 1250.5 } },
      { id: "zero", total: 2, client: { id: "b", name: "Beto", balance: 0 } },
      { id: "negative", total: 3, client: { id: "c", name: "Cora", balance: -250.75 } },
      { id: "no-client", total: 4, client: null },
    ])} />);

    const rows = screen.getAllByRole("row").slice(1);
    const positive = balanceText(rows[0]);
    const zero = balanceText(rows[1]);
    const negative = balanceText(rows[2]);
    const unavailable = balanceText(rows[3]);

    expect(positive).toContain((1250.5).toLocaleString("es-AR"));
    expect(zero).toContain((0).toLocaleString("es-AR"));
    expect(negative).toContain(((-250.75).toLocaleString("es-AR")));
    expect(negative).toContain("-");
    expect(unavailable).toContain("—");
    expect(unavailable).not.toContain("$0");
  });
});
