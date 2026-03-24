import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPublicProductsByBusinessId } from "@/actions/catalog";
import { getBusinessBySlug } from "@/actions/business";

vi.mock("@/lib/db", () => ({
  db: {
    product: {
      findMany: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
  },
}));

describe("getBusinessBySlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return business when slug exists", async () => {
    const { db } = await import("@/lib/db");

    const mockBusiness = {
      id: "business-123",
      name: "Test Business",
      slug: "test-business",
      logo: "https://example.com/logo.png",
    };

    (db.business.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockBusiness);

    const result = await getBusinessBySlug("test-business");

    expect(result).toEqual(mockBusiness);
    expect(db.business.findUnique).toHaveBeenCalledWith({
      where: { slug: "test-business" },
      select: { id: true, name: true, slug: true, logo: true },
    });
  });

  it("should return null when slug does not exist", async () => {
    const { db } = await import("@/lib/db");

    (db.business.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await getBusinessBySlug("non-existent-slug");

    expect(result).toBeNull();
  });

  it("should search case-insensitively", async () => {
    const { db } = await import("@/lib/db");

    const mockBusiness = {
      id: "business-456",
      name: "My Store",
      slug: "my-store",
      logo: null,
    };

    (db.business.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockBusiness);

    const result = await getBusinessBySlug("MY-STORE");

    expect(result).toEqual(mockBusiness);
    expect(db.business.findUnique).toHaveBeenCalledWith({
      where: { slug: "my-store" },
      select: { id: true, name: true, slug: true, logo: true },
    });
  });

  it("should return null when database throws an error", async () => {
    const { db } = await import("@/lib/db");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (db.business.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const result = await getBusinessBySlug("test");

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching business by slug:", expect.any(Error));
    consoleSpy.mockRestore();
  });
});

describe("getPublicProductsByBusinessId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return products for valid businessId", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Product One",
        salePrice: 100,
        unit: "unidades",
        image: "https://example.com/img1.jpg",
        amount: 50,
        brand: { name: "Brand A" },
        category: { name: "Category X" },
      },
      {
        id: "product-2",
        code: "P002",
        description: "Product Two",
        salePrice: 200,
        unit: null,
        image: null,
        amount: 30,
        brand: null,
        category: { name: "Category Y" },
      },
    ];

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    const result = await getPublicProductsByBusinessId("business-123");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "product-1",
      code: "P001",
      description: "Product One",
      brand: "Brand A",
      category: "Category X",
      salePrice: 100,
      unit: "unidades",
      image: "https://example.com/img1.jpg",
      amount: 50,
    });
  });

  it("should filter products with salePrice > 0", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Valid Product",
        salePrice: 100,
        unit: "unidades",
        image: null,
        amount: 10,
        brand: { name: "Brand" },
        category: null,
      },
    ];

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    await getPublicProductsByBusinessId("business-123");

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "business-123",
          salePrice: { gt: 0 },
        }),
      })
    );
  });

  it("should select only required fields", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Test",
        salePrice: 50,
        unit: "kg",
        image: null,
        amount: 100,
        brand: { name: "TestBrand" },
        category: { name: "TestCat" },
      },
    ];

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    await getPublicProductsByBusinessId("business-123");

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          code: true,
          description: true,
          salePrice: true,
          unit: true,
          image: true,
          amount: true,
          brand: expect.objectContaining({ select: expect.objectContaining({ name: true }) }),
          category: expect.objectContaining({ select: expect.objectContaining({ name: true }) }),
        }),
      })
    );
  });

  it("should return empty array on error", async () => {
    const { db } = await import("@/lib/db");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (db.product.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const result = await getPublicProductsByBusinessId("business-123");

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching public products:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("should sort products alphabetically by description", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      { id: "p1", code: null, description: "Zebra Product", salePrice: 100, unit: null, image: null, amount: 10, brand: null, category: null },
      { id: "p2", code: null, description: "Apple Product", salePrice: 100, unit: null, image: null, amount: 10, brand: null, category: null },
      { id: "p3", code: null, description: "Mango Product", salePrice: 100, unit: null, image: null, amount: 10, brand: null, category: null },
    ];

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    await getPublicProductsByBusinessId("business-123");

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { description: "asc" },
      })
    );
  });

  it("should handle null brand and category gracefully", async () => {
    const { db } = await import("@/lib/db");

    const mockProducts = [
      {
        id: "product-1",
        code: "P001",
        description: "Test",
        salePrice: 100,
        unit: null,
        image: null,
        amount: 10,
        brand: null,
        category: null,
      },
    ];

    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    const result = await getPublicProductsByBusinessId("business-123");

    expect(result[0].brand).toBeNull();
    expect(result[0].category).toBeNull();
  });
});
