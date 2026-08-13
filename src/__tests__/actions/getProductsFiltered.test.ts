import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProductsFiltered, getFilteredProductIds } from "@/actions/stock";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-123" } }),
}));

describe("getProductsFiltered Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return paginated shape with default page=1 and pageSize=25", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [{ id: "product-1", description: "Product A" }];
    const mockTotal = 1;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(mockTotal);

    const result = await getProductsFiltered({});

    expect(result).toHaveProperty("products");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("page");
    expect(result).toHaveProperty("pageSize");
    expect(result).toHaveProperty("totalPages");
    expect(result.products).toEqual(mockProducts);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.totalPages).toBe(1);
  });

  it("should respect custom page and pageSize parameters", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      { id: "product-1", description: "Product A" },
      { id: "product-2", description: "Product B" },
    ];
    const mockTotal = 2;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(mockTotal);

    const result = await getProductsFiltered({ page: 3, pageSize: 10 });

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
    expect(result.products).toHaveLength(2);
  });

  it("should clamp pageSize to max 100", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const result = await getProductsFiltered({ pageSize: 999 });

    expect(result.pageSize).toBe(100);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it("should enforce minimum page of 1", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const result = await getProductsFiltered({ page: 0 });

    expect(result.page).toBe(1);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 })
    );
  });

  it("should apply skip and take correctly", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsFiltered({ page: 3, pageSize: 25 });

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 25 })
    );
  });

  it("should return paginated products filtered by search term (description)", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Manzana Roja",
        salePrice: 100,
        price: 60,
        unit: "kg",
        brand: { name: "Brand A" },
        category: { name: "Frutas" },
        subCategory: { name: "Tropicales" },
      },
    ];
    const mockTotal = 1;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(mockTotal);

    const result = await getProductsFiltered({ search: "Manzana" });

    expect(result.products).toHaveLength(1);
    expect(result.products[0].description).toBe("Manzana Roja");
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { description: { contains: "Manzana", mode: "insensitive" } },
            { code: { contains: "Manzana", mode: "insensitive" } },
          ]),
        }),
      })
    );
  });

  it("should return paginated products filtered by search term (code)", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Product A",
        salePrice: 100,
        price: 60,
        unit: "unidades",
        brand: null,
        category: null,
        subCategory: null,
      },
    ];
    const mockTotal = 1;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(mockTotal);

    const result = await getProductsFiltered({ search: "P001" });

    expect(result.products).toHaveLength(1);
    expect(result.products[0].code).toBe("P001");
    expect(result.total).toBe(1);
  });

  it("should return paginated products filtered by categoryId", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Product A",
        salePrice: 100,
        price: 60,
        unit: "unidades",
        brand: null,
        category: { name: "Frutas" },
        subCategory: null,
      },
    ];
    const mockTotal = 1;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(mockTotal);

    const result = await getProductsFiltered({ categoryId: "category-1" });

    expect(result.products).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: "category-1",
        }),
      })
    );
  });

  it("should return paginated products filtered by brandId", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Product A",
        salePrice: 100,
        price: 60,
        unit: "unidades",
        brand: { name: "Brand A" },
        category: null,
        subCategory: null,
      },
    ];
    const mockTotal = 1;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(mockTotal);

    const result = await getProductsFiltered({ brandId: "brand-1" });

    expect(result.products).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: "brand-1",
        }),
      })
    );
  });

  it("should return paginated products filtered by supplierId", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Product A",
        salePrice: 100,
        price: 60,
        unit: "unidades",
        supplier: { id: "supplier-1", name: "Proveedor A" },
        brand: null,
        category: null,
        subCategory: null,
      },
    ];
    const mockTotal = 1;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(mockTotal);

    const result = await getProductsFiltered({ supplierId: "supplier-1" });

    expect(result.products).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supplierId: "supplier-1",
        }),
      })
    );
  });

  it("should return paginated products filtered by unit", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Product A",
        salePrice: 100,
        price: 60,
        unit: "kg",
        brand: null,
        category: null,
        subCategory: null,
      },
    ];
    const mockTotal = 1;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(mockTotal);

    const result = await getProductsFiltered({ unit: "kg" });

    expect(result.products).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unit: "kg",
        }),
      })
    );
  });

  it("should combine multiple filters with pagination", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Product A",
        salePrice: 100,
        price: 60,
        unit: "unidades",
        brand: { name: "Brand A" },
        category: { name: "Category A" },
        subCategory: null,
      },
    ];
    const mockTotal = 1;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(mockTotal);

    const result = await getProductsFiltered({
      search: "Product",
      categoryId: "category-1",
      brandId: "brand-1",
      page: 1,
      pageSize: 25,
    });

    expect(result.products).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.any(Array),
          categoryId: "category-1",
          brandId: "brand-1",
        }),
      })
    );
  });

  it("should include supplier, brand, category, and subCategory in results", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Product A",
        salePrice: 100,
        price: 60,
        unit: "unidades",
        supplier: { id: "supplier-1", name: "Supplier A" },
        brand: { name: "Brand A" },
        category: { name: "Category A" },
        subCategory: { name: "SubCategory A" },
      },
    ];
    const mockTotal = 1;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(mockTotal);

    const result = await getProductsFiltered({ page: 1, pageSize: 25 });

    expect(result.products[0].supplier).toBeDefined();
    expect(result.products[0].brand).toBeDefined();
    expect(result.products[0].category).toBeDefined();
    expect(result.products[0].subCategory).toBeDefined();
  });

  it("should calculate correct totalPages", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      Array(25).fill(null).map((_, i) => ({ id: `product-${i}` }))
    );
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(45);

    const result = await getProductsFiltered({ page: 1, pageSize: 25 });

    expect(result.totalPages).toBe(2);
    expect(result.total).toBe(45);
    expect(result.products).toHaveLength(25);
  });

  it("should return empty paginated result when no products match filters", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const result = await getProductsFiltered({ search: "NonExistent" });

    expect(result.products).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.totalPages).toBe(0);
  });

  it("should return empty paginated result when user is not authenticated", async () => {
    const authModule = await import("../../../auth");
    (authModule.auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await getProductsFiltered({ search: "test" });

    expect(result.products).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.totalPages).toBe(0);
  });

  it("should return empty paginated result when user has no businessId", async () => {
    const authModule = await import("../../../auth");
    (authModule.auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { id: "user-1", businessId: null },
    });

    const result = await getProductsFiltered({ search: "test" });

    expect(result.products).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.totalPages).toBe(0);
  });

  it("should handle database errors gracefully", async () => {
    const { db } = await import("@/lib/db");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (db.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const result = await getProductsFiltered({ search: "test" });

    expect(result.products).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.totalPages).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching filtered products:", expect.any(Error));
    consoleSpy.mockRestore();
  });
});

describe("getProductsFiltered - recentlyModified filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC1
  it("adds last_update gte clause when recentlyModified is true", async () => {
    const { db } = await import("@/lib/db");
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const before = Date.now();
    const expectedGte = new Date(before - 30 * 24 * 60 * 60 * 1000);

    await getProductsFiltered({ recentlyModified: true });

    const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where).toHaveProperty("last_update");
    expect(callArgs.where.last_update).toHaveProperty("gte");
    const actualGte: Date = callArgs.where.last_update.gte;
    expect(actualGte).toBeInstanceOf(Date);
    expect(Math.abs(actualGte.getTime() - expectedGte.getTime())).toBeLessThan(1000);
  });

  // AC2 — false
  it("does NOT add last_update clause when recentlyModified is false", async () => {
    const { db } = await import("@/lib/db");
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsFiltered({ recentlyModified: false });

    const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty("last_update");
  });

  // AC2 — undefined
  it("does NOT add last_update clause when recentlyModified is undefined", async () => {
    const { db } = await import("@/lib/db");
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsFiltered({});

    const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty("last_update");
  });

  // AC3
  it("getFilteredProductIds adds last_update gte clause when recentlyModified is true", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const before = Date.now();
    const expectedGte = new Date(before - 30 * 24 * 60 * 60 * 1000);

    await getFilteredProductIds({ recentlyModified: true });

    const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where).toHaveProperty("last_update");
    const actualGte: Date = callArgs.where.last_update.gte;
    expect(actualGte).toBeInstanceOf(Date);
    expect(Math.abs(actualGte.getTime() - expectedGte.getTime())).toBeLessThan(1000);
  });

  // AC4
  it("getFilteredProductIds does NOT add last_update clause when recentlyModified is false", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getFilteredProductIds({ recentlyModified: false });

    const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty("last_update");
  });
});

describe("Bulk update v2: sort order + last_update audit fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC1 (sort) — getProductsFiltered now orders by last_update desc
  it("getProductsFiltered sorts by last_update desc (replaces description asc)", async () => {
    const { db } = await import("@/lib/db");
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsFiltered({});

    const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ last_update: "desc" });
  });

  // AC2 (bulkUpdatePrices fix in stock.ts)
  it("bulkUpdatePrices (stock.ts) bumps last_update on each product update", async () => {
    const { db } = await import("@/lib/db");
    const { bulkUpdatePrices } = await import("@/actions/stock");

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "prod-1", price: 50, salePrice: 100 },
    ]);
    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "prod-1" });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (ops: unknown) =>
        Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : Promise.resolve([])
    );

    const before = Date.now();
    await bulkUpdatePrices(["prod-1"], 10);
    const after = Date.now();

    expect(db.product.update).toHaveBeenCalled();
    const updateCall = (db.product.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data).toHaveProperty("last_update");
    expect(updateCall.data.last_update).toBeInstanceOf(Date);
    const ts = (updateCall.data.last_update as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  // AC3 (toggleProductCatalogAction fix in stock.ts)
  it("toggleProductCatalogAction (stock.ts) bumps last_update", async () => {
    const { db } = await import("@/lib/db");
    const { toggleProductCatalogAction } = await import("@/actions/stock");

    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "prod-1",
      catalog: true,
    });

    const before = Date.now();
    await toggleProductCatalogAction("prod-1", true);
    const after = Date.now();

    expect(db.product.update).toHaveBeenCalledTimes(1);
    const updateCall = (db.product.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.catalog).toBe(true);
    expect(updateCall.data.last_update).toBeInstanceOf(Date);
    const ts = (updateCall.data.last_update as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  // AC5 (bulkUpdatePrices duplicate in stock/bulk.ts)
  it("bulkUpdatePrices (stock/bulk.ts) bumps last_update", async () => {
    const { db } = await import("@/lib/db");
    const bulkModule = await import("@/actions/stock/bulk");
    const fn = (bulkModule as Record<string, unknown>).bulkUpdatePrices as (
      ids: string[],
      pct: number
    ) => Promise<unknown>;
    expect(fn).toBeDefined();

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "prod-1", price: 50, salePrice: 100 },
    ]);
    (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "prod-1" });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (ops: unknown) =>
        Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : Promise.resolve([])
    );

    const before = Date.now();
    await fn(["prod-1"], 10);
    const after = Date.now();

    expect(db.product.update).toHaveBeenCalled();
    const updateCall = (db.product.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data).toHaveProperty("last_update");
    expect(updateCall.data.last_update).toBeInstanceOf(Date);
    const ts = (updateCall.data.last_update as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });
});
