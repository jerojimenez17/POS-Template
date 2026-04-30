import { describe, it, expect, vi, beforeEach } from "vitest";
import { bulkUpdateAmounts } from "@/actions/stock";

vi.mock("@/lib/db", () => ({
  db: {
    product: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-123" } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("bulkUpdateAmounts Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update amounts for selected products with valid amountChange and mode 'set'", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "product-1",
      amount: 50,
    });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates: unknown[]) => {
      return Promise.all(updates);
    });

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await bulkUpdateAmounts(["product-1"], 100, "set");

    expect(result.success).toBe(true);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("should update amounts for selected products with valid amountChange and mode 'add'", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "product-1",
      amount: 50,
    });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates: unknown[]) => {
      return Promise.all(updates);
    });

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await bulkUpdateAmounts(["product-1"], 25, "add");

    expect(result.success).toBe(true);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("should update amounts for selected products with valid amountChange and mode 'subtract'", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "product-1",
      amount: 50,
    });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates: unknown[]) => {
      return Promise.all(updates);
    });

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await bulkUpdateAmounts(["product-1"], 20, "subtract");

    expect(result.success).toBe(true);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("should apply correct 'set' mode: newAmount = amountChange", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "product-1",
      amount: 50,
    });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates: unknown[]) => {
      return Promise.all(updates);
    });

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await bulkUpdateAmounts(["product-1"], 100, "set");

    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        data: expect.objectContaining({
          amount: 100,
        }),
      })
    );
  });

  it("should apply correct 'add' mode: newAmount = oldAmount + amountChange", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "product-1",
      amount: 50,
    });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates: unknown[]) => {
      return Promise.all(updates);
    });

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await bulkUpdateAmounts(["product-1"], 25, "add");

    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        data: expect.objectContaining({
          amount: { increment: 25 },
        }),
      })
    );
  });

  it("should apply correct 'subtract' mode: newAmount = oldAmount - amountChange", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "product-1",
      amount: 50,
    });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates: unknown[]) => {
      return Promise.all(updates);
    });

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await bulkUpdateAmounts(["product-1"], 20, "subtract");

    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        data: expect.objectContaining({
          amount: { decrement: 20 },
        }),
      })
    );
  });

  it("should handle subtract mode when result would be negative (error or clamp to 0)", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "product-1",
      amount: 10,
    });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates: unknown[]) => {
      return Promise.all(updates);
    });

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await bulkUpdateAmounts(["product-1"], 20, "subtract");

    expect(result.success).toBe(true);
    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        data: expect.objectContaining({
          amount: { decrement: 20 },
        }),
      })
    );
  });

  it("should return error for empty productIds array", async () => {
    const result = await bulkUpdateAmounts([], 50, "set");

    expect(result.success).toBe(false);
    expect(result.error).toBe("No se seleccionaron productos");
  });

  it("should return error for invalid amountChange (negative when mode is set)", async () => {
    const result = await bulkUpdateAmounts(["product-1"], -10, "set");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Cantidad inválida");
  });

  it("should handle database errors gracefully", async () => {
    const { db } = await import("@/lib/db");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (db.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const result = await bulkUpdateAmounts(["product-1"], 50, "set");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Error al actualizar stock");
    consoleSpy.mockRestore();
  });

  it("should only update selected products, not all products", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "product-1",
      amount: 50,
    });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates: unknown[]) => {
      return Promise.all(updates);
    });

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await bulkUpdateAmounts(["product-1"], 100, "set");

    expect(db.product.update).toHaveBeenCalledTimes(1);
    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "product-1" } })
    );
  });

  it("should call revalidatePath after successful update", async () => {
    const { db } = await import("@/lib/db");
    const { revalidatePath } = await import("next/cache");

    (db.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "product-1",
      amount: 50,
    });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates: unknown[]) => {
      return Promise.all(updates);
    });

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await bulkUpdateAmounts(["product-1"], 100, "set");

    expect(revalidatePath).toHaveBeenCalledWith("/stock");
  });
});
