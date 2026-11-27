import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProductsFiltered, getFilteredProductIds } from "@/actions/stock";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    product: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-123" } }),
}));

describe("getProductsFiltered Server Action", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@/lib/db");
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it("preserves the complete array API used by ProductSearchBar and bulk update", async () => {
    const { db } = await import("@/lib/db");
    const products = [{ id: "product-1", description: "Manzana Roja" }];
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(products);

    const result = await getProductsFiltered({ search: "Manzana", supplierId: "supplier-1" });

    expect(result).toEqual(products);
    expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessId: "business-123", supplierId: "supplier-1" }),
    }));
  });

  it("applies all supported filters without pagination options", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getProductsFiltered({ search: "Product", categoryId: "category-1", brandId: "brand-1", unit: "kg", supplierId: "supplier-1" });

    expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business-123",
        categoryId: "category-1",
        brandId: "brand-1",
        unit: "kg",
        supplierId: "supplier-1",
        OR: expect.any(Array),
      }),
      orderBy: { description: "asc" },
    }));
  });

  it("returns an empty array when unauthenticated or when the database fails", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));
    expect(await getProductsFiltered({})).toEqual([]);

    const authModule = await import("../../../auth");
    (authModule.auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    expect(await getProductsFiltered({})).toEqual([]);
  });
});

describe("getProductsFiltered recentlyModified contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds a 30-day last_update clause when recentlyModified is true", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const before = Date.now();
    await getProductsFiltered({ recentlyModified: true });
    const where = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(where.last_update.gte).toBeInstanceOf(Date);
    expect(Math.abs(where.last_update.gte.getTime() - (before - 30 * 24 * 60 * 60 * 1000))).toBeLessThan(1000);
  });

  it("does not add last_update when recentlyModified is false or undefined", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await getProductsFiltered({ recentlyModified: false });
    expect((db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where).not.toHaveProperty("last_update");
    vi.clearAllMocks();
    await getProductsFiltered({});
    expect((db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where).not.toHaveProperty("last_update");
  });

  it("scopes getFilteredProductIds to the authenticated business", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "product-1" }]);
    expect(await getFilteredProductIds({ recentlyModified: true })).toEqual(["product-1"]);
    expect((db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where.businessId).toBe("business-123");
  });
});

describe("getProductsFiltered recovered array coverage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds case-insensitive search predicates for code, barcode, and description", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getProductsFiltered({ search: "Manzana" });

    expect((db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business-123",
        OR: expect.arrayContaining([
          { code: { contains: "Manzana", mode: "insensitive" } },
          { codebar: { contains: "Manzana", mode: "insensitive" } },
          { description: { contains: "Manzana", mode: "insensitive" } },
        ]),
      }),
    }));
  });

  it("applies category, brand, supplier, and unit filters as exact tenant-scoped predicates", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getProductsFiltered({ categoryId: "category-1", brandId: "brand-1", supplierId: "supplier-1", unit: "kg" });

    expect((db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toMatchObject({
      businessId: "business-123",
      categoryId: "category-1",
      brandId: "brand-1",
      supplierId: "supplier-1",
      unit: "kg",
    });
  });

  it("preserves product IVA and related supplier/category/brand data in the array result", async () => {
    const { db } = await import("@/lib/db");
    const product = {
      id: "product-1",
      description: "Leche",
      iva: 21,
      supplier: { id: "supplier-1", name: "Proveedor A" },
      category: { id: "category-1", name: "Almacén" },
      brand: { id: "brand-1", name: "Marca A" },
    };
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([product]);

    const result = await getProductsFiltered({ supplierId: "supplier-1" });

    expect(result).toEqual([product]);
    expect(result[0]).toMatchObject({ iva: 21, supplier: product.supplier, category: product.category, brand: product.brand });
  });

  it("returns an empty array for a valid query with no matching products", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await getProductsFiltered({ search: "does-not-exist", categoryId: "category-1" });

    expect(result).toEqual([]);
    expect(db.product.findMany).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated access without querying products", async () => {
    const { db } = await import("@/lib/db");
    const authModule = await import("../../../auth");
    (authModule.auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    expect(await getProductsFiltered({ search: "secret" })).toEqual([]);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it("rejects sessions without a businessId without querying products", async () => {
    const { db } = await import("@/lib/db");
    const authModule = await import("../../../auth");
    (authModule.auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ user: { id: "user-1", businessId: null } });

    expect(await getProductsFiltered({ search: "secret" })).toEqual([]);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty array and logs the action error when the query fails", async () => {
    const { db } = await import("@/lib/db");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("DB error");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    expect(await getProductsFiltered({ search: "Manzana" })).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching filtered products:", error);
    consoleSpy.mockRestore();
  });
});

describe("bulk update audit behavior", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@/lib/db");
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it("updates last_update in bulkUpdatePrices", async () => {
    const { db } = await import("@/lib/db");
    const { bulkUpdatePrices } = await import("@/actions/stock");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "prod-1", price: 50, salePrice: 100 }]);
    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "prod-1" });
    const before = Date.now();
    await bulkUpdatePrices(["prod-1"], 10);
    const timestamp = (db.product.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data.last_update as Date;
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("updates last_update in toggleProductCatalogAction", async () => {
    const { db } = await import("@/lib/db");
    const { toggleProductCatalogAction } = await import("@/actions/stock");
    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "prod-1", catalog: true });
    await toggleProductCatalogAction("prod-1", true);
    expect((db.product.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data.last_update).toBeInstanceOf(Date);
  });
});
