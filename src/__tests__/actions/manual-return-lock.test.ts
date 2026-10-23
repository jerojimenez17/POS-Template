import { beforeEach, describe, expect, it, vi } from "vitest";
import { processReturnAction } from "@/actions/sales/process";

const { authMock, dbMock, bulkUpdateStockMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  dbMock: { $transaction: vi.fn() },
  bulkUpdateStockMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/batch-utils", () => ({
  processInBatches: vi.fn(),
  bulkUpdateStock: bulkUpdateStockMock,
}));
vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn() } }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

describe("manual return cross-kind serialization", () => {
  const callOrder: string[] = [];
  const tx = {
    $queryRaw: vi.fn(async () => { callOrder.push("lock"); return []; }),
    order: {
      findFirst: vi.fn(async () => {
        callOrder.push("order-read");
        return {
          id: "sale-1",
          businessId: "business-1",
          items: [{ id: "line-1", productId: "product-1", quantity: 1, price: 100, subTotal: 100 }],
          returns: [{ kind: "CREDIT_NOTE", status: "PENDING", items: [] }],
        };
      }),
    },
    cashboxSession: { findFirst: vi.fn(async () => ({ id: "session-1", cashboxId: "cashbox-1" })) },
    saleReturn: { create: vi.fn() },
    stockMovement: { createMany: vi.fn() },
    saleReturnItem: { createMany: vi.fn() },
    cashBox: { update: vi.fn() },
    cashMovement: { create: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    authMock.mockResolvedValue({
      user: { id: "user-1", businessId: "business-1", role: "ADMIN", email: "admin@example.test" },
    });
    tx.$queryRaw.mockImplementation(async () => { callOrder.push("lock"); return []; });
    tx.order.findFirst.mockImplementation(async () => {
      callOrder.push("order-read");
      return {
        id: "sale-1",
        businessId: "business-1",
        items: [{ id: "line-1", productId: "product-1", quantity: 1, price: 100, subTotal: 100 }],
        returns: [{ kind: "CREDIT_NOTE", status: "PENDING", items: [] }],
      };
    });
    tx.saleReturn.create.mockResolvedValue({ id: "manual-return-1" });
    dbMock.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));
  });

  it("locks the tenant-scoped order before reading return state and blocks pending credit notes", async () => {
    const result = await processReturnAction({
      orderId: "sale-1",
      items: [{ productId: "product-1", quantity: 0.5, refundAmount: 50 }],
      reason: "Partial return",
    });

    expect.soft(callOrder[0]).toBe("lock");
    expect.soft(callOrder[1]).toBe("order-read");
    expect.soft(tx.$queryRaw).toHaveBeenCalled();
    expect.soft(tx.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sale-1", businessId: "business-1" },
    }));
    expect.soft(result).toHaveProperty("success", false);
    expect.soft(tx.saleReturn.create).not.toHaveBeenCalled();
    expect.soft(tx.saleReturnItem.createMany).not.toHaveBeenCalled();
    expect.soft(tx.stockMovement.createMany).not.toHaveBeenCalled();
    expect.soft(bulkUpdateStockMock).not.toHaveBeenCalled();
    expect.soft(tx.cashBox.update).not.toHaveBeenCalled();
    expect.soft(tx.cashMovement.create).not.toHaveBeenCalled();
  });

  it("fails closed on a direct unauthenticated manual-return call", async () => {
    authMock.mockResolvedValue(null);

    const result = await processReturnAction({
      orderId: "sale-1",
      items: [{ productId: "product-1", quantity: 1, refundAmount: 100 }],
      reason: "Return",
    });

    expect(result).toHaveProperty("error", "No autorizado");
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });
});
