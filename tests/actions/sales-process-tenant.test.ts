import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const transactionMock = vi.fn();
const cashBoxUpdateMock = vi.fn().mockResolvedValue({ id: "cashbox-1" });

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { $transaction: transactionMock } }));
vi.mock("@/lib/auth-gates", () => ({
  assertWritePermission: vi.fn().mockResolvedValue({ success: true }),
  requireFeature: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/lib/daily-limits", () => ({
  getDailyUsage: vi.fn().mockResolvedValue({ salesCount: 0 }),
  checkDailyLimit: vi.fn().mockResolvedValue({ allowed: true }),
  incrementDailyUsage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const saleInput = {
  total: 20,
  seller: "Tester",
  paidMethod: "Efectivo",
  products: [{ id: "product-1", code: "P1", description: "Product", salePrice: 20, amount: 1 }],
};

function saleTransaction(session: unknown) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    cashboxSession: { findFirst: vi.fn().mockResolvedValue(session) },
    order: { create: vi.fn().mockResolvedValue({ id: "order-1", items: [] }) },
    product: { update: vi.fn().mockResolvedValue({}) },
    stockMovement: { create: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    productRanking: { upsert: vi.fn().mockResolvedValue({}) },
    cashBox: { update: cashBoxUpdateMock },
    cashMovement: { create: vi.fn().mockResolvedValue({ id: "movement-1", total: 20, businessId: "business-1" }) },
  };
  transactionMock.mockImplementationOnce(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
  return tx;
}

describe("sales cashbox tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1", businessId: "business-1", role: "ADMIN" } });
  });

  it("uses the authenticated business and related cashbox for a valid sale", async () => {
    const tx = saleTransaction({ id: "session-1", cashboxId: "cashbox-1" });
    const { processSaleAction } = await import("@/actions/sales");

    const result = await processSaleAction(saleInput);

    expect(result.success).toBe(true);
    expect(tx.cashboxSession.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        businessId: "business-1",
        status: "OPEN",
        cashbox: { businessId: "business-1" },
      },
    });
    expect(cashBoxUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "cashbox-1", businessId: "business-1" },
    }));
  });

  it("does not mutate cash for a session from another business", async () => {
    const tx = saleTransaction(null);
    const { processSaleAction } = await import("@/actions/sales");

    const result = await processSaleAction(saleInput);

    expect(result.error).toBe("Error al procesar la venta");
    expect(tx.cashboxSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessId: "business-1" }),
    }));
    expect(cashBoxUpdateMock).not.toHaveBeenCalled();
  });

  it("requires the authenticated business on a valid return cashbox session", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([]),
      cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }) },
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: "order-1",
          items: [{ id: "item-1", productId: "product-1", product: { businessId: "business-1" } }],
          returns: [],
        }),
      },
      saleReturn: { create: vi.fn().mockResolvedValue({ id: "return-1" }) },
      product: { update: vi.fn().mockResolvedValue({}) },
      stockMovement: { create: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      orderItem: { findFirst: vi.fn().mockResolvedValue({ id: "item-1" }) },
      saleReturnItem: { create: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      cashBox: { update: cashBoxUpdateMock },
      cashMovement: { create: vi.fn().mockResolvedValue({}) },
    };
    transactionMock.mockImplementationOnce(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
    const { processReturnAction } = await import("@/actions/sales");

    const result = await processReturnAction({
      orderId: "order-1",
      items: [{ productId: "product-1", quantity: 1, refundAmount: 20 }],
      reason: "test",
    });

    expect(result.success).toBe(true);
    expect(tx.cashboxSession.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        businessId: "business-1",
        status: "OPEN",
        cashbox: { businessId: "business-1" },
      },
    });
    expect(cashBoxUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "cashbox-1", businessId: "business-1" },
    }));
  });

  it("rejects a foreign order before creating any return or movement", async () => {
    const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
      order: { findFirst: vi.fn().mockResolvedValue(null) },
      cashboxSession: { findFirst: vi.fn() },
      saleReturn: { create: vi.fn() },
      product: { update: vi.fn() },
      stockMovement: { create: vi.fn() },
      saleReturnItem: { create: vi.fn() },
      cashBox: { update: cashBoxUpdateMock },
      cashMovement: { create: vi.fn() },
    };
    transactionMock.mockImplementationOnce(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
    const { processReturnAction } = await import("@/actions/sales");

    const result = await processReturnAction({
      orderId: "foreign-order",
      items: [{ productId: "product-1", quantity: 1, refundAmount: 20 }],
      reason: "test",
    });

    expect(result.error).toBe("Error al procesar la devolución");
    expect(tx.cashboxSession.findFirst).not.toHaveBeenCalled();
    expect(tx.saleReturn.create).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });

  it("rejects a product from another business before mutations", async () => {
    const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
      order: { findFirst: vi.fn().mockResolvedValue({
        id: "order-1",
        items: [{ id: "item-1", productId: "foreign-product", product: { businessId: "business-2" } }],
      }) },
      cashboxSession: { findFirst: vi.fn() },
      saleReturn: { create: vi.fn() },
      product: { update: vi.fn() },
      stockMovement: { create: vi.fn() },
      saleReturnItem: { create: vi.fn() },
      cashBox: { update: cashBoxUpdateMock },
      cashMovement: { create: vi.fn() },
    };
    transactionMock.mockImplementationOnce(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
    const { processReturnAction } = await import("@/actions/sales");

    const result = await processReturnAction({
      orderId: "order-1",
      items: [{ productId: "foreign-product", quantity: 1, refundAmount: 20 }],
      reason: "test",
    });

    expect(result.error).toBe("Error al procesar la devolución");
    expect(tx.saleReturn.create).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });
});


