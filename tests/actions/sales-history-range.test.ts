import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { businessId: "business-1", role: "ADMIN", email: "admin@example.com" } }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    order: { findMany: vi.fn() },
  },
}));

import { auth } from "@/auth";
import { getSalesAction, getUniqueSellersAction } from "@/actions/sales/history";

const order = {
  id: "order-1",
  total: 100,
  discountAmount: 0,
  paymentMethod: "Efectivo",
  paymentMethod2: null,
  totalMethod2: null,
  seller: "Ana",
  discountPercentage: 0,
  date: new Date("2026-10-05T12:00:00"),
  clientId: null,
  client: null,
  items: [],
  clientIvaCondition: null,
  clientDocumentType: "DNI",
  clientDocumentNumber: null,
  CAE: null,
};

describe("getSalesAction range and cursor contract", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { businessId: "business-1", role: "ADMIN", email: "admin@example.com" } } as never);
    const { db } = await import("@/lib/db");
    vi.mocked(db.order.findMany).mockResolvedValue([]);
  });

  it("scopes every query to the authenticated business and paid sales", async () => {
    const { db } = await import("@/lib/db");

    await getSalesAction({ from: "2026-10-01", to: "2026-10-05" });

    expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessId: "business-1", paidStatus: "pago" }),
    }));
  });

  it("translates an inclusive public day range into local half-open boundaries", async () => {
    const { db } = await import("@/lib/db");

    await getSalesAction({ from: "2026-10-01", to: "2026-10-05" });

    const call = vi.mocked(db.order.findMany).mock.calls[0][0];
    expect(call.where).toMatchObject({
      date: {
        gte: new Date(2026, 9, 1),
        lt: new Date(2026, 9, 6),
      },
    });
  });

  it("rejects invalid calendar input without querying", async () => {
    const { db } = await import("@/lib/db");

    const result = await getSalesAction({ from: "2026-02-30", to: "2026-03-01" });

    expect(result).toEqual({ sales: [], nextCursor: null, error: "Filtros de ventas inválidos" });
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it("keeps filters on cursor requests and orders ties deterministically", async () => {
    const { db } = await import("@/lib/db");

    await getSalesAction({
      cursor: "order-previous",
      take: 2,
      from: "2026-10-01",
      to: "2026-10-05",
      seller: "Ana",
      documentTypes: ["DNI"],
      paymentMethods: ["Tarjeta"],
    });

    const call = vi.mocked(db.order.findMany).mock.calls[0][0];
    expect(call).toMatchObject({
      where: {
        businessId: "business-1",
        paidStatus: "pago",
        seller: "Ana",
        clientDocumentType: { in: ["DNI"] },
        OR: [
          { paymentMethod: { in: ["Tarjeta"] } },
          { paymentMethod2: { in: ["Tarjeta"] } },
        ],
        date: { gte: new Date(2026, 9, 1), lt: new Date(2026, 9, 6) },
      },
      cursor: { id: "order-previous" },
      skip: 1,
      take: 3,
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
  });

  it("forces USER queries to their session email even when showAll-style callers manipulate seller", async () => {
    const { auth } = await import("@/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValue({ user: { businessId: "business-1", role: "USER", email: "seller@example.com" } } as never);

    await getSalesAction({ from: "2026-10-01", to: "2026-10-05", seller: "other@example.com", showAll: true } as never);

    expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ seller: "seller@example.com", businessId: "business-1" }),
    }));
  });

  it("returns no result and does not query when a scoped USER has no email", async () => {
    const { auth } = await import("@/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValue({ user: { businessId: "business-1", role: "USER", email: null } } as never);

    await expect(getSalesAction({ showAll: true } as never)).resolves.toEqual({ sales: [], nextCursor: null });
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it("keeps ADMIN range queries business-wide without a seller predicate", async () => {
    const { db } = await import("@/lib/db");

    await getSalesAction({ from: "2026-10-01", to: "2026-10-05", seller: "other@example.com" });

    expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ date: { gte: new Date(2026, 9, 1), lt: new Date(2026, 9, 6) }, seller: "other@example.com" }),
    }));
  });

  it("remains backwards compatible when callers omit filters", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.order.findMany).mockResolvedValue([order]);

    const result = await getSalesAction();

    expect(result.sales).toHaveLength(1);
    expect(result.error).toBeUndefined();
    expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "business-1", paidStatus: "pago" },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    }));
  });

  it("returns a safe error while preserving the empty cursor contract when the query fails", async () => {
    const { db } = await import("@/lib/db");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const prismaError = Object.assign(new Error("SELECT * FROM orders?customer=secret"), {
      name: "PrismaClientKnownRequestError",
      code: "P2024",
    });
    vi.mocked(db.order.findMany).mockRejectedValue(prismaError);

    await expect(getSalesAction()).resolves.toEqual({
      sales: [],
      nextCursor: null,
      error: "No se pudieron cargar las ventas",
    });
    expect(log).toHaveBeenCalledWith("Sales query failed", {
      phase: "orders",
      name: "PrismaClientKnownRequestError",
      code: "P2024",
    });
    expect(log.mock.calls.flat().join(" ")).not.toContain("SELECT");
    log.mockRestore();
  });
});

describe("getUniqueSellersAction authorization", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { businessId: "business-1", role: "ADMIN", email: "admin@example.com" } } as never);
    const { db } = await import("@/lib/db");
    vi.mocked(db.order.findMany).mockResolvedValue([]);
  });

  it("returns the tenant seller list for ADMIN while preserving business scope", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.order.findMany).mockResolvedValue([
      { seller: "seller@example.com" },
      { seller: "other@example.com" },
    ] as never);

    await expect(getUniqueSellersAction()).resolves.toEqual(["seller@example.com", "other@example.com"]);
    expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessId: "business-1" }),
    }));
  });

  it("returns only the normalized USER email without querying or enumerating the tenant", async () => {
    const { auth } = await import("@/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValue({ user: { businessId: "business-1", role: "USER", email: "  seller@example.com  " } } as never);

    await expect(getUniqueSellersAction()).resolves.toEqual(["seller@example.com"]);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty list for unauthenticated sessions without querying", async () => {
    const { auth } = await import("@/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValue(null);

    await expect(getUniqueSellersAction()).resolves.toEqual([]);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});
