import { describe, it, expect, vi, beforeEach } from "vitest";
import { bulkUpdateAmounts } from "@/actions/stock";

vi.mock("@/lib/auth-gates", () => ({
  assertWritePermission: vi.fn().mockResolvedValue({ success: true, data: { id: "user-1", businessId: "business-123", role: "ADMIN", business: null } }),
}));

vi.mock("@/lib/pusher-server", () => ({
  pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-123" } }),
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({ id: "sm-1" }) },
    $transaction: vi.fn().mockImplementation(async (cb: unknown) => {
      if (Array.isArray(cb)) return Promise.all(cb);
      return typeof cb === "function" ? cb(dbMock) : cb;
    }),
  };
  return { db: dbMock };
});

let dbRef: {
  product: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  stockMovement: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const seeded = (rows: Array<{ id: string; amount: number }>) => {
  if (!dbRef) return;
  dbRef.product.findMany.mockResolvedValue(rows);
};

describe("bulkUpdateAmounts Server Action (transactional)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    dbRef = ((await import("@/lib/db")) as { db: typeof dbRef }).db;
    seeded([{ id: "product-1", amount: 100 }]);
  });

  it("mode 'set' updates amount to amountChange and writes one ADJUSTMENT", async () => {
    const { db } = await import("@/lib/db");

    const result = await bulkUpdateAmounts(["product-1"], 50, "set");

    expect(result.success).toBe(true);
    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        data: expect.objectContaining({ amount: 50, last_update: expect.any(Date) }),
      }),
    );
    // set goes from 100 → 50, delta = -50 → ADJUSTMENT -50
    expect(db.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ADJUSTMENT",
          quantity: -50,
          productId: "product-1",
          businessId: "business-123",
          reason: "Ajuste masivo (set)",
        }),
      }),
    );
  });

  it("mode 'add' updates amount with increment and writes a positive ADJUSTMENT", async () => {
    const { db } = await import("@/lib/db");

    const result = await bulkUpdateAmounts(["product-1"], 25, "add");

    expect(result.success).toBe(true);
    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        data: expect.objectContaining({ amount: 125 }),
      }),
    );
    // add goes from 100 → 125, delta = +25
    expect(db.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "ADJUSTMENT", quantity: 25 }),
      }),
    );
  });

  it("mode 'subtract' updates amount with decrement and writes a negative ADJUSTMENT", async () => {
    const { db } = await import("@/lib/db");

    const result = await bulkUpdateAmounts(["product-1"], 20, "subtract");

    expect(result.success).toBe(true);
    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        data: expect.objectContaining({ amount: 80 }),
      }),
    );
    // subtract goes from 100 → 80, delta = -20
    expect(db.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "ADJUSTMENT", quantity: -20 }),
      }),
    );
  });

  it("writes one movement per product when multiple products are changed", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "product-1", amount: 100 },
      { id: "product-2", amount: 50 },
    ]);

    const result = await bulkUpdateAmounts(["product-1", "product-2"], 10, "add");

    expect(result.success).toBe(true);
    expect(db.product.update).toHaveBeenCalledTimes(2);
    expect(db.stockMovement.create).toHaveBeenCalledTimes(2);
  });

  it("blocks subtract that would drive stock below zero and aborts the batch", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "product-1", amount: 5 }]);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await bulkUpdateAmounts(["product-1"], 20, "subtract");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Error al actualizar stock");
    // The two-pass design validates before any write, so no update/movement issued.
    expect(db.product.update).not.toHaveBeenCalled();
    expect(db.stockMovement.create).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("aborts the whole batch if any product would go negative (atomic)", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "product-1", amount: 100 },
      { id: "product-2", amount: 5 }, // would go negative
    ]);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await bulkUpdateAmounts(["product-1", "product-2"], 20, "subtract");

    expect(result.success).toBe(false);
    expect(db.product.update).not.toHaveBeenCalled();
    expect(db.stockMovement.create).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("returns error for empty productIds array", async () => {
    const result = await bulkUpdateAmounts([], 50, "set");

    expect(result.success).toBe(false);
    expect(result.error).toBe("No se seleccionaron productos");
  });

  it("returns error for invalid amountChange (negative when mode is set)", async () => {
    const result = await bulkUpdateAmounts(["product-1"], -10, "set");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Cantidad inválida");
  });

  it("calls revalidateTag after a successful update", async () => {
    const { revalidateTag } = await import("next/cache");

    await bulkUpdateAmounts(["product-1"], 50, "set");

    expect(revalidateTag).toHaveBeenCalled();
  });
});