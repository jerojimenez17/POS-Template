import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProductByCode, createProduct, updateProduct, getProductsBySearch, getProductsFiltered, getProductsPaginated } from "@/actions/stock";

vi.mock("@/lib/db", () => {
  const productMock = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const stockMovementMock = { create: vi.fn().mockResolvedValue({ id: "sm-1" }) };
  const dbMock = {
    product: productMock,
    supplier: { findUnique: vi.fn() },
    stockMovement: stockMovementMock,
    // For createProduct/updateProduct we use the callback form of $transaction
    // (passing `tx` == db itself). getProductsPaginated uses the array form.
    $transaction: vi.fn().mockImplementation(async (x: unknown) => {
      if (Array.isArray(x)) return Promise.all(x);
      return typeof x === "function" ? x(dbMock) : x;
    }),
  };
  return { db: dbMock };
});

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-123" } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/pusher-server", () => ({
  pusherServer: {
    trigger: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/plan-resolver", () => ({
  checkLimit: vi.fn().mockResolvedValue(undefined),
}));

describe("Product Codebar Feature Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProductByCode", () => {
    it("should query both code and codebar in db", async () => {
      const { db } = await import("@/lib/db");
      const mockProduct = { id: "p-1", code: "123", codebar: "9876543210" };
      (db.product.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockProduct);

      const result = await getProductByCode("9876543210");

      expect(result).toEqual(mockProduct);
      expect(db.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId: "business-123",
            OR: [
              { code: "9876543210" },
              { codebar: "9876543210" },
            ],
          }),
        })
      );
    });
  });

  describe("Search Actions containing Codebar", () => {
    it("should search codebar in getProductsBySearch", async () => {
      const { db } = await import("@/lib/db");
      (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await getProductsBySearch("9876");

      expect(db.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId: "business-123",
            OR: expect.arrayContaining([
              { code: { contains: "9876", mode: "insensitive" } },
              { codebar: { contains: "9876", mode: "insensitive" } },
              { description: { contains: "9876", mode: "insensitive" } },
            ]),
          }),
        })
      );
    });

    it("should search codebar in getProductsFiltered", async () => {
      const { db } = await import("@/lib/db");
      (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await getProductsFiltered({ search: "9876" });

      expect(db.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId: "business-123",
            OR: expect.arrayContaining([
              { code: { contains: "9876", mode: "insensitive" } },
              { codebar: { contains: "9876", mode: "insensitive" } },
              { description: { contains: "9876", mode: "insensitive" } },
            ]),
          }),
        })
      );
    });

    it("should search codebar in getProductsPaginated", async () => {
      const { db } = await import("@/lib/db");
      (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await getProductsPaginated({ search: "9876" });

      expect(db.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId: "business-123",
            OR: expect.arrayContaining([
              { code: { contains: "9876", mode: "insensitive" } },
              { codebar: { contains: "9876", mode: "insensitive" } },
              { description: { contains: "9876", mode: "insensitive" } },
            ]),
          }),
        })
      );
    });
  });

  describe("Product Creation and Modification with Supplier Prefix", () => {
    const baseProductInput = {
      code: "71",
      description: "Test Product",
      price: 100,
      gain: 20,
      salePrice: 120,
      client_bonus: 0,
      brandId: "brand-1",
      categoryId: "category-1",
      subCategoryId: "sub-1",
      amount: 10,
      unit: "unidades",
      codebar: "11223344",
    };

    it("should create product with correct codebar", async () => {
      const { db } = await import("@/lib/db");
      (db.product.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "p-new" });

      await createProduct(baseProductInput);

      expect(db.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            codebar: "11223344",
          }),
        })
      );
    });

    it("should update product with correct codebar", async () => {
      const { db } = await import("@/lib/db");
      (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "p-edit" });

      await updateProduct("p-1", { ...baseProductInput, codebar: "44332211" });

      expect(db.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "p-1" },
          data: expect.objectContaining({
            codebar: "44332211",
          }),
        })
      );
    });

    it("should auto-prefix code when supplier is selected on creation", async () => {
      const { db } = await import("@/lib/db");
      (db.supplier.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "sup-1",
        name: "Taladros Industriales",
      });
      (db.product.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "p-new" });

      await createProduct({ ...baseProductInput, supplierId: "sup-1" });

      expect(db.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: "tal-71", // supplier Taladros Industriales -> tal
            supplier: { connect: { id: "sup-1" } },
          }),
        })
      );
    });

    it("should not double-prefix if prefix already exists on creation", async () => {
      const { db } = await import("@/lib/db");
      (db.supplier.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "sup-1",
        name: "Taladros Industriales",
      });
      (db.product.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "p-new" });

      await createProduct({ ...baseProductInput, code: "tal-71", supplierId: "sup-1" });

      expect(db.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: "tal-71",
            supplier: { connect: { id: "sup-1" } },
          }),
        })
      );
    });
  });
});
