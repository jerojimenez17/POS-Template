import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUnpaidOrders, type AccountLedgerOrder } from "@/actions/unpaid-orders";
import { auth } from "@/auth";
import { db } from "@/lib/db";

const { authFunctionMock, orderFindManyMock } = vi.hoisted(() => ({
  authFunctionMock: vi.fn(),
  orderFindManyMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authFunctionMock }));
vi.mock("@/lib/db", () => ({ db: { order: { findMany: orderFindManyMock } } }));

const findMany = vi.mocked(db.order.findMany);

describe("getUnpaidOrders account balance projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { businessId: "business-session" } } as never);
  });

  it("selects the current client balance with the page query and returns it as a number without per-order reads", async () => {
    const client = { id: "client-1", name: "Ana", balance: 1250.5 };
    findMany.mockResolvedValue([{
      id: "order-1",
      date: new Date("2026-01-01T00:00:00.000Z"),
      total: 99,
      status: "confirmado",
      paidStatus: "inpago",
      clientId: client.id,
      client,
      notes: null,
    }] as never);

    const result = await getUnpaidOrders({ businessId: "ignored-by-auth", status: "inpago", limit: 25 });
    const orders = (result.data as { orders: AccountLedgerOrder[] }).orders;
    const query = findMany.mock.calls[0]?.[0] as { select: { client: { select: Record<string, boolean> } } };
    const clientResult: unknown = orders[0]?.client;
    const returnedBalance = typeof clientResult === "object" && clientResult !== null && "balance" in clientResult
      ? clientResult.balance
      : undefined;

    expect(query.select.client.select).toEqual(expect.objectContaining({ id: true, name: true, balance: true }));
    expect(orders[0]?.client).toEqual({ id: "client-1", name: "Ana", balance: 1250.5 });
    expect(returnedBalance).toBe(1250.5);
    expect(typeof returnedBalance).toBe("number");
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("retains a null client relation instead of fabricating a zero balance", async () => {
    findMany.mockResolvedValue([{
      id: "order-without-client",
      date: new Date("2026-01-01T00:00:00.000Z"),
      total: 99,
      status: "confirmado",
      paidStatus: "inpago",
      clientId: null,
      client: null,
      notes: null,
    }] as never);

    const result = await getUnpaidOrders({ businessId: "business-session", status: "inpago", limit: 25 });
    const orders = (result.data as { orders: AccountLedgerOrder[] }).orders;

    expect(orders[0]?.client).toBeNull();
  });
});
