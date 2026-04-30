import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProductsFiltered } from "@/actions/stock";

vi.mock("@/lib/db", () => ({
  db: {
    product: {
      findMany: vi.fn(),
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

  it("should return products filtered by search term (description)", async () => {
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

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    const result = await getProductsFiltered({ search: "Manzana" });

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Manzana Roja");
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

  it("should return products filtered by search term (code)", async () => {
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

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    const result = await getProductsFiltered({ search: "P001" });

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("P001");
  });

  it("should return products filtered by categoryId", async () => {
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

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    const result = await getProductsFiltered({ categoryId: "category-1" });

    expect(result).toHaveLength(1);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: "category-1",
        }),
      })
    );
  });

  it("should return products filtered by brandId", async () => {
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

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    const result = await getProductsFiltered({ brandId: "brand-1" });

    expect(result).toHaveLength(1);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: "brand-1",
        }),
      })
    );
  });

  it("should return products filtered by unit", async () => {
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

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    const result = await getProductsFiltered({ unit: "kg" });

    expect(result).toHaveLength(1);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unit: "kg",
        }),
      })
    );
  });

  it("should combine multiple filters (search + category + brand)", async () => {
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

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    const result = await getProductsFiltered({
      search: "Product",
      categoryId: "category-1",
      brandId: "brand-1",
    });

    expect(result).toHaveLength(1);
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

  it("should return empty array when no products match filters", async () => {
    const { db } = await import("@/lib/db");

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await getProductsFiltered({ search: "NonExistent" });

    expect(result).toEqual([]);
  });

  it("should return empty array when user is not authenticated", async () => {
    const authModule = await import("../../../auth");
    (authModule.auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await getProductsFiltered({ search: "test" });

    expect(result).toEqual([]);
  });

  it("should return empty array when user has no businessId", async () => {
    const authModule = await import("../../../auth");
    (authModule.auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { id: "user-1", businessId: null },
    });

    const result = await getProductsFiltered({ search: "test" });

    expect(result).toEqual([]);
  });

  it("should include related brand, category, and subCategory in results", async () => {
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
        subCategory: { name: "SubCategory A" },
      },
    ];

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    const result = await getProductsFiltered({});

    expect(result[0].brand).toBeDefined();
    expect(result[0].category).toBeDefined();
    expect(result[0].subCategory).toBeDefined();
  });

  it("should handle database errors gracefully", async () => {
    const { db } = await import("@/lib/db");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (db.product.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const result = await getProductsFiltered({ search: "test" });

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith("Error filtering products:", expect.any(Error));
    consoleSpy.mockRestore();
  });
});
