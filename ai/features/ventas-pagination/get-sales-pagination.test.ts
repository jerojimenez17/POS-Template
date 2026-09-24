import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, findManyMock, mapperMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findManyMock: vi.fn(),
  mapperMock: vi.fn((order: { id: string }) => ({ id: order.id })),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { order: { findMany: findManyMock } } }));
vi.mock("@/actions/sales/history", () => ({ mapOrderToBillState: mapperMock }));

import { getSalesAction } from "@/actions/sales/get-sales";

const filters = {
  documentTypes: ["FACTURA_C" as const],
  paymentMethods: ["efectivo"],
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-01-31T23:59:59.999Z",
  seller: "seller-a",
};

describe("getSalesAction: server-side filtered, stable pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { businessId: "business-a" } });
    findManyMock.mockResolvedValue([]);
  });

  it("applies every filter before take and keeps business and paid-status isolation", async () => {
    await getSalesAction({ filters, take: 25 } as never);
    const where = findManyMock.mock.calls[0][0].where;
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business-a",
        paidStatus: "pago",
        seller: "seller-a",
        AND: [{ OR: [
          { paymentMethod: { in: ["Efectivo"] } },
          { paymentMethod2: { in: ["Efectivo"] } },
        ] }],
        billType: { in: ["Factura C"] },
        date: { gte: new Date(filters.startDate), lte: new Date(filters.endDate) },
      }),
      take: 26,
    }));
    expect(where).not.toHaveProperty("paidMethod");
    expect(where).not.toHaveProperty("businessId", "business-b");
  });

  it("matches canonical and historical payment labels in either payment field", async () => {
    await getSalesAction({
      filters: { documentTypes: [], paymentMethods: ["efectivo", "cuentaDNI"] },
    } as never);

    expect(findManyMock.mock.calls[0][0].where.AND).toEqual([{
      OR: [
        { paymentMethod: { in: ["Efectivo", "Cuenta DNI"] } },
        { paymentMethod2: { in: ["Efectivo", "Cuenta DNI"] } },
      ],
    }]);
  });

  it("uses an explicit no-restriction policy for empty filters and clamps the limit", async () => {
    await getSalesAction({ filters: { documentTypes: [], paymentMethods: [] }, take: 10000 } as never);
    const query = findManyMock.mock.calls[0][0];
    expect(query.where).not.toHaveProperty("documentType");
    expect(query.where).not.toHaveProperty("paidMethod");
    expect(query.take).toBeLessThanOrEqual(101);
  });

  it("orders by date desc then id desc and returns a cursor only for take+1", async () => {
    findManyMock.mockResolvedValueOnce([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const result = await getSalesAction({ take: 2 });
    expect(findManyMock.mock.calls[0][0].orderBy).toEqual([{ date: "desc" }, { id: "desc" }]);
    expect(result.sales.map((sale) => sale.id)).toEqual(["a", "b"]);
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it("decodes a compound cursor and requests only lexicographically older rows", async () => {
    const cursor = Buffer.from(JSON.stringify({ date: "2026-01-10T12:00:00.000Z", id: "sale-20" })).toString("base64url");
    await getSalesAction({ cursor, take: 20, filters } as never);
    const query = findManyMock.mock.calls[0][0];
    expect(query.where.OR).toEqual([
      { date: { lt: new Date("2026-01-10T12:00:00.000Z") } },
      { date: new Date("2026-01-10T12:00:00.000Z"), id: { lt: "sale-20" } },
    ]);
    expect(query.where.AND).toEqual([{
      OR: [
        { paymentMethod: { in: ["Efectivo"] } },
        { paymentMethod2: { in: ["Efectivo"] } },
      ],
    }]);
    expect(query.where.seller).toBe("seller-a");
    expect(query.where.billType).toEqual({ in: ["Factura C"] });
    expect(query.where.date).toEqual({
      gte: new Date(filters.startDate),
      lte: new Date(filters.endDate),
    });
  });

  it("walks compound-cursor pages without duplicating equal-date rows", async () => {
    const date = new Date("2026-01-10T12:00:00.000Z");
    const rows = ["sale-3", "sale-2", "sale-1"].map((id) => ({ id, date }));
    findManyMock.mockImplementation(async (query: { take: number; where?: { OR?: unknown } }) => {
      const cursorBranch = query.where?.OR;
      const cursorId = Array.isArray(cursorBranch) && cursorBranch[1]
        && typeof cursorBranch[1] === "object" && cursorBranch[1] !== null
        && "id" in cursorBranch[1]
        && typeof cursorBranch[1].id === "object" && cursorBranch[1].id !== null
        && "lt" in cursorBranch[1].id
        ? String(cursorBranch[1].id.lt)
        : undefined;
      const start = cursorId ? rows.findIndex((row) => row.id === cursorId) + 1 : 0;
      return rows.slice(start, start + query.take);
    });

    const first = await getSalesAction({ take: 2, filters } as never);
    const second = await getSalesAction({ cursor: first.nextCursor ?? undefined, take: 2, filters } as never);
    const ids = [...first.sales, ...second.sales].map((sale) => sale.id);

    expect(ids).toEqual(["sale-3", "sale-2", "sale-1"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(second.nextCursor).toBeNull();
  });

  it("treats start and end dates as inclusive boundaries", async () => {
    await getSalesAction({ filters: { ...filters, seller: undefined } } as never);
    expect(findManyMock.mock.calls[0][0].where.date).toEqual({
      gte: new Date("2026-01-01T00:00:00.000Z"),
      lte: new Date("2026-01-31T23:59:59.999Z"),
    });
  });

  it("returns a safe empty result without leaking database errors", async () => {
    findManyMock.mockRejectedValueOnce(new Error("private database details"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(getSalesAction()).resolves.toEqual({ sales: [], nextCursor: null });
    vi.restoreAllMocks();
  });
});
