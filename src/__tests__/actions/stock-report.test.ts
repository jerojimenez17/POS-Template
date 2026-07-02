import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createProduct,
  updateProduct,
  updateStockAmount,
  bulkUpdateAmounts,
  deleteProduct,
} from "@/actions/stock";
import { processSaleAction, processReturnAction } from "@/actions/sales";
import { getDailyReportAction } from "@/actions/sales/history";

const BUSINESS_ID = "business-123";

vi.mock("@/lib/auth-gates", () => ({
  assertWritePermission: vi.fn().mockResolvedValue({
    success: true,
    data: { id: "user-1", businessId: BUSINESS_ID, role: "ADMIN", business: null },
  }),
  requireFeature: vi.fn().mockResolvedValue({
    success: true,
    data: { id: "user-1", businessId: BUSINESS_ID, role: "ADMIN", business: null },
  }),
  assertLimit: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/plan-resolver", () => ({
  checkLimit: vi.fn().mockResolvedValue(undefined),
  getCachedPlan: vi.fn().mockResolvedValue({
    plan: "BASIC",
    maxProducts: 999999,
    dailySalesLimit: 999999,
  }),
}));

vi.mock("@/lib/pusher-server", () => ({
  pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/daily-limits", () => ({
  getDailyUsage: vi.fn().mockResolvedValue({ salesCreated: 0, productsCreated: 0, clientsCreated: 0 }),
  checkDailyLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 999999 }),
  incrementDailyUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: BUSINESS_ID, role: "ADMIN" } }),
}));

/**
 * Build a `db` mock whose `$transaction(callback)` runs the callback in-band
 * with `tx` === the db mock itself. The shapes exposed cover every Prisma call
 * used by the stock + sales actions under test.
 */
const buildDbMock = (overrides: {
  product?: Partial<{
    count: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  }>;
  stockMovementsSeed?: unknown[];
  orders?: unknown[];
  returns?: unknown[];
  cashboxSession?: unknown;
  order?: unknown;
  saleReturn?: unknown;
} = {}) => {
  const stockMovementCreate = vi.fn().mockResolvedValue({ id: "sm-1" });
  const dbMock: Record<string, unknown> = {
    product: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "prod-1", amount: 0, code: null, description: null }),
      update: vi.fn().mockResolvedValue({ id: "prod-1", amount: 0, code: null, description: null }),
      delete: vi.fn().mockResolvedValue({}),
      ...(overrides.product ?? {}),
    },
    supplier: { findUnique: vi.fn().mockResolvedValue(null) },
    stockMovement: {
      create: stockMovementCreate,
      findMany: vi.fn().mockResolvedValue(overrides.stockMovementsSeed ?? []),
    },
    productImage: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    order: {
      findMany: vi.fn().mockResolvedValue(overrides.orders ?? []),
      create: vi.fn().mockResolvedValue(overrides.order ?? { id: "order-1", items: [] }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(overrides.order ?? null),
    },
    saleReturn: {
      findMany: vi.fn().mockResolvedValue(overrides.returns ?? []),
      create: vi.fn().mockResolvedValue(overrides.saleReturn ?? { id: "return-1" }),
    },
    saleReturnItem: { create: vi.fn().mockResolvedValue({}) },
    orderItem: { findFirst: vi.fn().mockResolvedValue({ id: "orderItem-1" }) },
    orderUpdate: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    cashboxSession: { findFirst: vi.fn().mockResolvedValue(overrides.cashboxSession ?? { id: "session-1", cashboxId: "cashbox-1" }) },
    cashBox: { update: vi.fn().mockResolvedValue({}) },
    cashMovement: { create: vi.fn().mockResolvedValue({ id: "cm-1" }) },
    productRanking: { upsert: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockImplementation(async (cb: unknown) => {
      if (Array.isArray(cb)) return Promise.all(cb);
      return typeof cb === "function" ? cb(dbMock) : cb;
    }),
  };
  return { db: dbMock, stockMovementCreate };
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FR-026B — createProduct StockMovement semantics", () => {
  it("createProduct with amount=5 creates one PURCHASE movement of +5", async () => {
    vi.resetModules();
    const { db, stockMovementCreate } = buildDbMock({
      product: {
        create: vi.fn().mockResolvedValue({ id: "p-1", amount: 5, code: "P1", description: "Pd1" }),
      },
    });
    vi.doMock("@/lib/db", () => ({ db }));

    const { createProduct: action } = await import("@/actions/stock");
    const result = await action({
      code: "P1",
      description: "Pd1",
      amount: 5,
      unit: "u",
      price: 0,
      gain: 0,
      salePrice: 0,
      client_bonus: 0,
      catalog: true,
    } as never);

    expect(result.success).toBe("Producto cargado");
    expect(stockMovementCreate).toHaveBeenCalledTimes(1);
    expect(stockMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "PURCHASE",
          quantity: 5,
          productId: "p-1",
          businessId: BUSINESS_ID,
          reason: "Alta de producto",
        }),
      }),
    );
  });

  it("createProduct with amount=0 creates NO movement", async () => {
    vi.resetModules();
    const { db, stockMovementCreate } = buildDbMock({
      product: {
        create: vi.fn().mockResolvedValue({ id: "p-1", amount: 0, code: "P1", description: "Pd1" }),
      },
    });
    vi.doMock("@/lib/db", () => ({ db }));

    const { createProduct: action } = await import("@/actions/stock");
    await action({
      code: "P1",
      description: "Pd1",
      amount: 0,
      unit: "u",
      price: 0,
      gain: 0,
      salePrice: 0,
      client_bonus: 0,
      catalog: true,
    } as never);

    expect(stockMovementCreate).not.toHaveBeenCalled();
  });
});

describe("FR-026B — updateProduct delta ADJUSTMENT", () => {
  it("updateProduct amount 10→7 writes ADJUSTMENT -3", async () => {
    vi.resetModules();
    const { db, stockMovementCreate } = buildDbMock({
      product: {
        findUnique: vi.fn().mockResolvedValue({ amount: 10 }),
        update: vi.fn().mockResolvedValue({ id: "p-1", amount: 7, code: "P1", description: "Pd1" }),
      },
    });
    vi.doMock("@/lib/db", () => ({ db }));

    const { updateProduct: action } = await import("@/actions/stock");
    const result = await action("p-1", { amount: 7 } as never);

    expect(result.success).toBe("Producto actualizado");
    expect(stockMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ADJUSTMENT",
          quantity: -3,
          productId: "p-1",
          businessId: BUSINESS_ID,
          reason: "Ajuste manual",
        }),
      }),
    );
  });
});

describe("FR-026B — bulkUpdateAmounts atomic + negative-block", () => {
  it("writes one ADJUSTMENT per product inside one transaction", async () => {
    vi.resetModules();
    const { db, stockMovementCreate } = buildDbMock({
      product: {
        findMany: vi.fn().mockResolvedValue([
          { id: "p-1", amount: 10 },
          { id: "p-2", amount: 20 },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    vi.doMock("@/lib/db", () => ({ db }));

    const { bulkUpdateAmounts: action } = await import("@/actions/stock");
    const result = await action(["p-1", "p-2"], 5, "add");

    expect(result.success).toBe(true);
    expect(db.product.update).toHaveBeenCalledTimes(2);
    expect(stockMovementCreate).toHaveBeenCalledTimes(2);
    expect(stockMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "ADJUSTMENT", quantity: 5, productId: "p-1" }),
      }),
    );
    expect(stockMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "ADJUSTMENT", quantity: 5, productId: "p-2" }),
      }),
    );
  });

  it("rolls back every write when one product would go negative (atomic)", async () => {
    vi.resetModules();
    const { db, stockMovementCreate } = buildDbMock({
      product: {
        findMany: vi.fn().mockResolvedValue([
          { id: "p-1", amount: 100 },
          { id: "p-2", amount: 3 }, // would go negative on subtract of 5
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    vi.doMock("@/lib/db", () => ({ db }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { bulkUpdateAmounts: action } = await import("@/actions/stock");
    const result = await action(["p-1", "p-2"], 5, "subtract");

    expect(result.success).toBe(false);
    expect(db.product.update).not.toHaveBeenCalled();
    expect(stockMovementCreate).not.toHaveBeenCalled();
  });
});

describe("FR-026B — deleteProduct final ADJUSTMENT snapshot", () => {
  it("deleteProduct with amount=4 writes ADJUSTMENT -4 with product snapshot reason then deletes", async () => {
    vi.resetModules();
    const { db, stockMovementCreate } = buildDbMock({
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: "p-1", amount: 4, code: "ABC", description: "Producto ABC" }),
        delete: vi.fn().mockResolvedValue({}),
      },
    });
    vi.doMock("@/lib/db", () => ({ db }));

    const { deleteProduct: action } = await import("@/actions/stock");
    const result = await action("p-1");

    expect(result.success).toBe("Producto eliminado");
    expect(stockMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ADJUSTMENT",
          quantity: -4,
          productId: "p-1",
          businessId: BUSINESS_ID,
          reason: "Eliminación: ABC - Producto ABC",
        }),
      }),
    );
    expect(db.product.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p-1" } }));
  });
});

describe("FR-026B — negative-stock blocking on updateStockAmount", () => {
  it("throws and writes nothing when newAmount would be negative", async () => {
    vi.resetModules();
    const { db, stockMovementCreate } = buildDbMock({
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: "p-1", amount: 5 }),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    vi.doMock("@/lib/db", () => ({ db }));

    const { updateStockAmount: action } = await import("@/actions/stock");
    const result = await action("p-1", 20);

    expect(result.error).toBe("Stock insuficiente");
    expect(db.product.update).not.toHaveBeenCalled();
    expect(stockMovementCreate).not.toHaveBeenCalled();
  });
});

describe("FR-026B — SALE / RETURN movements (existing behavior preserved)", () => {
  it("processSaleAction writes a SALE movement with negative quantity", async () => {
    vi.resetModules();
    const { stockMovementCreate } = buildDbMock({
      cashboxSession: { id: "session-1", cashboxId: "cashbox-1" },
      order: { id: "order-1", items: [] },
    });
    // Re-register the mock for this isolated module.
    vi.doMock("@/lib/db", () => ({
      db: {
        product: { update: vi.fn().mockResolvedValue({}) },
        stockMovement: { create: stockMovementCreate },
        cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }) },
        order: { create: vi.fn().mockResolvedValue({ id: "order-1", items: [] }) },
        cashBox: { update: vi.fn().mockResolvedValue({}) },
        cashMovement: { create: vi.fn().mockResolvedValue({ id: "cm-1" }) },
        productRanking: { upsert: vi.fn().mockResolvedValue({}) },
        $transaction: vi.fn().mockImplementation(async (cb: unknown) => {
          if (Array.isArray(cb)) return Promise.all(cb);
          return typeof cb === "function"
            ? cb({
                cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }) },
                order: { create: vi.fn().mockResolvedValue({ id: "order-1", items: [] }) },
                product: { update: vi.fn().mockResolvedValue({}) },
                stockMovement: { create: stockMovementCreate },
                productRanking: { upsert: vi.fn().mockResolvedValue({}) },
                cashBox: { update: vi.fn().mockResolvedValue({}) },
                cashMovement: { create: vi.fn().mockResolvedValue({ id: "cm-1" }) },
              })
            : cb;
        }),
      },
    }));

    const { processSaleAction: action } = await import("@/actions/sales");
    await action({
      total: 100,
      totalWithDiscount: 100,
      seller: "Tester",
      paidMethod: "Efectivo",
      products: [{ id: "p-1", code: "P1", description: "Pd1", salePrice: 100, amount: 2 }],
    });

    expect(stockMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "SALE",
          quantity: -2,
          productId: "p-1",
          businessId: BUSINESS_ID,
        }),
      }),
    );
  });

  it("processReturnAction writes a RETURN movement with positive quantity", async () => {
    vi.resetModules();
    const returnCreate = vi.fn().mockResolvedValue({ id: "return-1" });
    const stockMovementCreate = vi.fn().mockResolvedValue({ id: "sm-1" });
    vi.doMock("@/lib/db", () => ({
      db: {
        product: { update: vi.fn().mockResolvedValue({}) },
        stockMovement: { create: stockMovementCreate },
        saleReturn: { create: returnCreate },
        saleReturnItem: { create: vi.fn().mockResolvedValue({}) },
        orderItem: { findFirst: vi.fn().mockResolvedValue({ id: "oi-1" }) },
        cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }) },
        cashBox: { update: vi.fn().mockResolvedValue({}) },
        cashMovement: { create: vi.fn().mockResolvedValue({ id: "cm-1" }) },
        $transaction: vi.fn().mockImplementation(async (cb: unknown) => {
          if (Array.isArray(cb)) return Promise.all(cb);
          return typeof cb === "function"
            ? cb({
                saleReturn: { create: returnCreate },
                product: { update: vi.fn().mockResolvedValue({}) },
                stockMovement: { create: stockMovementCreate },
                saleReturnItem: { create: vi.fn().mockResolvedValue({}) },
                orderItem: { findFirst: vi.fn().mockResolvedValue({ id: "oi-1" }) },
                cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }) },
                cashBox: { update: vi.fn().mockResolvedValue({}) },
                cashMovement: { create: vi.fn().mockResolvedValue({ id: "cm-1" }) },
              })
            : cb;
        }),
      },
    }));

    const { processReturnAction: action } = await import("@/actions/sales");
    await action({
      orderId: "order-1",
      items: [{ productId: "p-1", quantity: 3, refundAmount: 30 }],
      reason: "test",
    });

    expect(stockMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "RETURN",
          quantity: 3,
          productId: "p-1",
          businessId: BUSINESS_ID,
        }),
      }),
    );
  });
});

describe("FR-026C — daily report aggregation consistency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T12:00:00Z"));
  });

  it(" SALE/RETURN/ADJUSTMENT movements aggregate by productId into outs and ins", async () => {
    vi.resetModules();
    const movements = [
      { productId: "p-1", product: { code: "P1", description: "Pd1" }, quantity: -2, type: "SALE" },       // → outs +2
      { productId: "p-1", product: { code: "P1", description: "Pd1" }, quantity: 3, type: "RETURN" },       // → ins +3
      { productId: "p-1", product: { code: "P1", description: "Pd1" }, quantity: -3, type: "ADJUSTMENT" },  // → outs +3
      { productId: "p-2", product: { code: "P2", description: "Pd2" }, quantity: 5, type: "PURCHASE" },    // → ins +5
    ];
    vi.doMock("@/lib/db", () => ({
      db: {
        order: { findMany: vi.fn().mockResolvedValue([]) },
        saleReturn: { findMany: vi.fn().mockResolvedValue([]) },
        stockMovement: { findMany: vi.fn().mockResolvedValue(movements) },
      },
    }));

    const { getDailyReportAction: report } = await import("@/actions/sales/history");
    const result = await report(new Date("2026-06-30"));

    expect(result.success).toBe(true);
    if (!result.success) return;
    const outs = (result.data as { stockActivity: { outs: Array<{ productId: string; quantity: number }> } }).stockActivity.outs;
    const ins = (result.data as { stockActivity: { ins: Array<{ productId: string; quantity: number }> } }).stockActivity.ins;

    // same product aggregated: outs = |−2| + |−3| = 5, ins = 3
    const out1 = outs.find(o => o.productId === "p-1");
    const in1 = ins.find(i => i.productId === "p-1");
    expect(out1?.quantity).toBe(5);
    expect(in1?.quantity).toBe(3);

    // p-2 only has ins
    const in2 = ins.find(i => i.productId === "p-2");
    expect(in2?.quantity).toBe(5);
    expect(outs.find(o => o.productId === "p-2")).toBeUndefined();
  });
});