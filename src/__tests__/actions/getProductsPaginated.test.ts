import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProductsPaginated } from "@/actions/stock";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-123" } }),
}));

describe("getProductsPaginated Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return paginated products with default values", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Product A",
        salePrice: 100,
        price: 60,
        unit: "unidades",
        gain: 40,
        amount: 10,
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

    const result = await getProductsPaginated({});

    expect(result.products).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.totalPages).toBe(1);
  });

  it("should respect custom page and pageSize", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(50);

    const result = await getProductsPaginated({ page: 3, pageSize: 10 });

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
    expect(result.totalPages).toBe(5);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
  });

  it("should cap pageSize at 100", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsPaginated({ pageSize: 999 });

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

    await getProductsPaginated({ page: 0 });

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 })
    );
  });

  it("should filter by search term", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsPaginated({ search: "Manzana" });

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { code: { contains: "Manzana", mode: "insensitive" } },
            { description: { contains: "Manzana", mode: "insensitive" } },
          ],
        }),
      })
    );
  });

  it("should filter by categoryId", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsPaginated({ categoryId: "category-1" });

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: "category-1" }),
      })
    );
  });

  it("should combine multiple filters", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsPaginated({
      search: "Product",
      categoryId: "category-1",
      brandId: "brand-1",
    });

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
        gain: 40,
        amount: 10,
        supplier: { name: "Supplier A" },
        brand: { name: "Brand A" },
        category: { name: "Category A" },
        subCategory: { name: "SubCategory A" },
      },
    ];

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await getProductsPaginated({});

    expect(result.products[0].supplier).toBeDefined();
    expect(result.products[0].brand).toBeDefined();
    expect(result.products[0].category).toBeDefined();
    expect(result.products[0].subCategory).toBeDefined();
  });

  it("should return empty result when user is not authenticated", async () => {
    const authModule = await import("../../../auth");
    (authModule.auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await getProductsPaginated({});

    expect(result.products).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it("should return empty result when user has no businessId", async () => {
    const authModule = await import("../../../auth");
    (authModule.auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { id: "user-1", businessId: null },
    });

    const result = await getProductsPaginated({});

    expect(result.products).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("should handle database errors gracefully", async () => {
    const { db } = await import("@/lib/db");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (db.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const result = await getProductsPaginated({});

    expect(result.products).toEqual([]);
    expect(result.total).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching paginated products:", expect.any(Error));
    consoleSpy.mockRestore();
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

    const result = await getProductsPaginated({ pageSize: 25 });

    expect(result.totalPages).toBe(2);
    expect(result.page).toBe(1);
    expect(result.total).toBe(45);
  });

  it("should order products by description ascending by default", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsPaginated({});

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { description: "asc" } })
    );
  });
});
