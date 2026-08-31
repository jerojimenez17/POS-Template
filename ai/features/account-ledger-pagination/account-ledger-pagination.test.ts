import { beforeEach, describe, expect, it, vi } from "vitest";

import { getUnpaidOrders } from "@/actions/unpaid-orders";
import { auth } from "@/auth";
import { db } from "@/lib/db";

interface LedgerOrder {
  id: string;
  date: Date;
  total: number;
  status: string;
  paidStatus: string;
  clientId: string | null;
  client: { id: string; name: string | null } | null;
  notes: string | null;
}

const orderFindMany = vi.mocked(db.order.findMany);
const orderFindUnique = vi.mocked(db.order.findUnique);
const authMock = vi.mocked(auth);

const input = (overrides: Record<string, unknown> = {}) => ({
  businessId: "business-from-request",
  status: "pago",
  ...overrides,
}) as Parameters<typeof getUnpaidOrders>[0];

const order = (id: string): LedgerOrder => ({
  id,
  date: new Date("2026-01-01T00:00:00.000Z"),
  total: 100,
  status: "confirmado",
  paidStatus: "pago",
  clientId: "client-1",
  client: { id: "client-1", name: "Ana" },
  notes: null,
});

describe("getUnpaidOrders paginated contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { businessId: "business-from-session" } } as never);
    orderFindMany.mockResolvedValue([]);
    orderFindUnique.mockResolvedValue(null);
  });

  it("returns a page envelope and uses the default infinite limit plus one", async () => {
    orderFindMany.mockResolvedValue(Array.from({ length: 51 }, (_, index) => order(`order-${index}`)) as never);

    const result = await getUnpaidOrders(input());

    expect(result).toEqual({
      success: true,
      data: {
        orders: expect.any(Array),
        nextCursor: expect.any(String),
        hasMore: true,
      },
    });
    expect((result.data as { orders: LedgerOrder[] }).orders).toHaveLength(50);
    expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));
  });

  it("caps a requested limit at 100 while still querying limit plus one", async () => {
    await getUnpaidOrders(input({ limit: 999 }));

    expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
  });

  it.each(["inpago", "pendiente"])(
    "keeps the explicit %s batch bounded to the fixed 100-row contract",
    async (status) => {
      await getUnpaidOrders(input({ status, limit: 999 }));

      expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
    },
  );

  it("uses the opaque cursor for continuation and a total, stable order", async () => {
    await getUnpaidOrders(input({ cursor: "opaque-cursor" }));

    const query = orderFindMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(query).toHaveProperty("where");
    expect(query).toHaveProperty("orderBy", [
      { client: { name: "asc" } },
      { date: "desc" },
      { id: "asc" },
    ]);
    expect(JSON.stringify(query)).not.toContain("opaque-cursor");
    expect(query.where).toEqual(expect.objectContaining({ OR: expect.any(Array) }));
    expect(query).not.toHaveProperty("skip", expect.any(Number));
  });

  it.each([
    ["pendiente", { status: "pendiente" }],
    ["inpago", { paidStatus: "inpago", status: { not: "pendiente" } }],
    ["pagado", { paidStatus: "pago", status: { not: "pendiente" } }],
    ["all", { status: { not: "pendiente" } }],
  ])("preserves %s filtering semantics in every page request", async (_name, expected) => {
    await getUnpaidOrders(input({ status: _name }));

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(expected) }),
    );
  });

  it("trims search, omits whitespace-only filters, and searches the client relation", async () => {
    await getUnpaidOrders(input({ search: "  Ána  " }));
    expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ client: { name: { contains: "Ána", mode: "insensitive" } } }),
    }));

    vi.clearAllMocks();
    await getUnpaidOrders(input({ search: "   " }));
    expect((orderFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where).not.toHaveProperty("client");
  });

  it("always authorizes from the session business, never the request business", async () => {
    await getUnpaidOrders(input({ businessId: "attacker-business" }));
    expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessId: "business-from-session" }),
    }));

    vi.clearAllMocks();
    authMock.mockResolvedValue(null as never);
    await expect(getUnpaidOrders(input({ businessId: "attacker-business" }))).resolves.toEqual({
      success: false,
      error: "No autorizado",
    });
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it("keeps detail requests unpaginated and preserves the full detail relation contract", async () => {
    orderFindUnique.mockResolvedValue({ id: "order-1", client: {}, cashMovements: [] } as never);

    await getUnpaidOrders(input({ orderId: "order-1", limit: 50, cursor: "must-not-apply" }));

    expect(orderFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: { client: true, cashMovements: true },
    }));
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it("traverses a 250-order ordered fixture with each real cursor exactly once", async () => {
    const names = ["Ana", "Ana", "Émile", "Zoe", "Álvaro", "ana", "Émile"];
    const fixture: LedgerOrder[] = [
      { ...order("null-client"), clientId: null, client: null, date: new Date("2026-01-01T00:00:00.000Z") },
      { ...order("empty-a"), client: { id: "empty-a-client", name: "" }, date: new Date("2026-01-02T00:00:00.000Z") },
      { ...order("empty-b"), client: { id: "empty-b-client", name: "" }, date: new Date("2026-01-02T00:00:00.000Z") },
      ...Array.from({ length: 247 }, (_, index) => ({
        ...order(`order-${index}`),
        date: new Date(`2026-01-${String((index % 7) + 1).padStart(2, "0")}T00:00:00.000Z`),
        client: { id: `client-${index}`, name: names[index % names.length] },
      })),
    ];
    const compare = (left: LedgerOrder, right: LedgerOrder): number => {
      const leftName = left.client?.name;
      const rightName = right.client?.name;
      if (leftName === null || leftName === undefined) return rightName === null || rightName === undefined ? compareDateAndId(left, right) : 1;
      if (rightName === null || rightName === undefined) return -1;
      const nameResult = leftName.localeCompare(rightName);
      return nameResult || compareDateAndId(left, right);
    };
    const compareDateAndId = (left: LedgerOrder, right: LedgerOrder): number =>
      right.date.getTime() - left.date.getTime() || left.id.localeCompare(right.id);
    const ordered = [...fixture].sort(compare);
    const findBoundary = (query: Record<string, unknown>): LedgerOrder | null => {
      const conditions = query.where && typeof query.where === "object"
        ? (query.where as Record<string, unknown>).OR
        : undefined;
      if (!Array.isArray(conditions) || conditions.length === 0) return null;
      const first = conditions[0] as Record<string, unknown>;
      const isNullBoundary = first.client === null;
      const boundaryName = isNullBoundary
        ? null
        : (((conditions[1] as Record<string, unknown>).client as Record<string, unknown>).name as string);
      const dateCondition = (isNullBoundary ? first : conditions[1]) as Record<string, unknown>;
      const dateValue = ((dateCondition.date as Record<string, unknown>).lt ?? dateCondition.date) as Date;
      const idCondition = (conditions[isNullBoundary ? 1 : 2] as Record<string, unknown>).id as Record<string, unknown>;
      const boundaryId = String(idCondition.gt ?? "");
      return ordered.find((candidate) => (candidate.client ? candidate.client.name : null) === boundaryName &&
        candidate.date.getTime() === new Date(dateValue).getTime() && candidate.id === boundaryId) ?? null;
    };

    orderFindMany.mockImplementation((async (query: Record<string, unknown>) => {
      const boundary = findBoundary(query);
      const start = boundary ? ordered.findIndex((candidate) => candidate.id === boundary.id) + 1 : 0;
      const take = Number(query.take);
      return ordered.slice(start, start + take) as never;
    }) as never);

    const loaded: string[] = [];
    const cursors: Array<string | null> = [];
    let cursor: string | null = null;
    let requests = 0;
    do {
      cursors.push(cursor);
      const result = await getUnpaidOrders(input({ cursor }));
      const page = (result.data as { orders: LedgerOrder[]; nextCursor: string | null; hasMore: boolean });
      loaded.push(...page.orders.map(({ id }) => id));
      cursor = page.nextCursor;
      requests += 1;
    } while (cursor !== null && requests < 10);

    expect(cursor).toBeNull();
    expect(loaded).toEqual(ordered.map(({ id }) => id));
    expect(new Set(loaded).size).toBe(fixture.length);
    expect(cursors[0]).toBeNull();
    expect(cursors.slice(1).every((value) => typeof value === "string")).toBe(true);
    expect(new Set(cursors.slice(1)).size).toBe(cursors.length - 1);
    expect(orderFindMany).toHaveBeenCalledTimes(5);
    expect(orderFindMany.mock.calls.every(([query]) => !(query as Record<string, unknown>).skip)).toBe(true);
  });
});
