import { describe, it, expect, vi, beforeEach } from "vitest";
import { bulkUpdatePrices } from "@/actions/stock";

vi.mock("@/lib/db", () => ({
  db: {
    product: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-123" } }),
}));

vi.mock("@/lib/auth-gates", () => ({
  assertWritePermission: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

describe("bulkUpdatePrices Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update prices for selected products with valid percentage", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "product-1", salePrice: 100, price: 60 },
      { id: "product-2", salePrice: 200, price: 120 },
    ]);

    (db.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await bulkUpdatePrices(["product-1", "product-2"], 10);

    expect(result.success).toBe(true);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("should apply 10% increase correctly using multiply factor", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "product-1", salePrice: 100, price: 60 },
    ]);

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates) => {
      return Promise.all(updates);
    });

    await bulkUpdatePrices(["product-1"], 10);

    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        data: expect.objectContaining({
          salePrice: { multiply: 1.1 },
        }),
      })
    );
  });

  it("should apply 25% increase correctly using multiply factor", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "product-1", salePrice: 100, price: 60 },
    ]);

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates) => {
      return Promise.all(updates);
    });

    await bulkUpdatePrices(["product-1"], 25);

    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        data: expect.objectContaining({
          salePrice: { multiply: 1.25 },
        }),
      })
    );
  });

  it("should recalculate gain after price update", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "product-1", salePrice: 100, price: 60 },
    ]);

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates) => {
      return Promise.all(updates);
    });

    await bulkUpdatePrices(["product-1"], 10);

    const updateCall = (db.product.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.gain).toBeDefined();
    expect(typeof updateCall.data.gain).toBe("number");
  });

  it("should return error for empty productIds array", async () => {
    const result = await bulkUpdatePrices([], 10);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No se seleccionaron productos");
  });

  it("should return error for invalid percentage (negative)", async () => {
    const result = await bulkUpdatePrices(["product-1"], -5);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Porcentaje inválido");
  });

  it("should return error for invalid percentage (exceeds 100)", async () => {
    const result = await bulkUpdatePrices(["product-1"], 150);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Porcentaje inválido");
  });

  it("should handle database errors gracefully", async () => {
    const { db } = await import("@/lib/db");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (db.product.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const result = await bulkUpdatePrices(["product-1"], 10);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Error al actualizar precios");
    consoleSpy.mockRestore();
  });

  it("should only update selected products, not all products", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "product-1", salePrice: 100, price: 60 },
    ]);

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates) => {
      return Promise.all(updates);
    });

    await bulkUpdatePrices(["product-1"], 10);

    expect(db.product.update).toHaveBeenCalledTimes(1);
    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "product-1" } })
    );
  });

  it("should call revalidateTag after successful update", async () => {
    const { db } = await import("@/lib/db");
    const { revalidateTag } = await import("next/cache");

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "product-1", salePrice: 100, price: 60 },
    ]);

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (updates) => {
      return Promise.all(updates);
    });

    await bulkUpdatePrices(["product-1"], 10);

    expect(revalidateTag).toHaveBeenCalled();
  });
});
