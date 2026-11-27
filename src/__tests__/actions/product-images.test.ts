import { describe, it, expect, vi, beforeEach } from "vitest";
import { newProduct } from "@/components/actions/newProduct";
import { updateProduct } from "@/actions/stock";
import { PublicProduct } from "@/actions/catalog";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/auth-gates", () => ({
  assertLimit: vi.fn().mockResolvedValue({ success: true }),
  assertWritePermission: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/daily-limits", () => ({
  getDailyUsage: vi.fn().mockResolvedValue({ productsCreated: 0 }),
  checkDailyLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 999999 }),
  incrementDailyUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/pusher-server", () => ({
  pusherServer: {
    trigger: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    product: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: "product-1" }),
      update: vi.fn().mockResolvedValue({ id: "product-1" }),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    supplier: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    productImage: {
      findMany: vi.fn().mockResolvedValue([{ id: "old-1", url: "https://firebase.com/old.jpg" }]),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({ id: "sm-1" }) },
    // Callback-form $transaction used by updateProduct (and other barrel
    // actions). Pass the same db mock as the `tx` so the same vi.fns back the
    // calls.
    $transaction: vi.fn().mockImplementation(async (x: unknown) => {
      if (Array.isArray(x)) return Promise.all(x);
      return typeof x === "function" ? x(dbMock) : x;
    }),
  };
  return { db: dbMock };
});

describe("newProduct — multi-image support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create ProductImage rows when imageUrls are provided", async () => {
    const { db } = await import("@/lib/db");

    const payload = {
      id: "",
      code: "IMG-001",
      description: "Multi-image product",
      price: 100,
      gain: 20,
      amount: 10,
      unit: "Unidad",
      brand: "",
      category: "",
      subCategory: "",
      supplier: "",
      image: "",
      imageName: "",
      client_bonus: 0,
      salePrice: 120,
      catalog: true,
      details: "",
      imageUrls: ["https://firebase.com/photo1.jpg", "https://firebase.com/photo2.jpg"],
    };

    const result = await newProduct(payload);

    expect(result).toEqual({ success: "Producto cargado con éxito" });
    expect(db.productImage.createMany).toHaveBeenCalledWith({
      data: [
        { productId: "product-1", url: "https://firebase.com/photo1.jpg" },
        { productId: "product-1", url: "https://firebase.com/photo2.jpg" },
      ],
    });
  });

  it("should create product without images when imageUrls is empty", async () => {
    const { db } = await import("@/lib/db");

    const payload = {
      id: "",
      code: "NO-IMG",
      description: "No image product",
      price: 50,
      gain: 10,
      amount: 5,
      unit: "Unidad",
      brand: "",
      category: "",
      subCategory: "",
      supplier: "",
      image: "",
      imageName: "",
      client_bonus: 0,
      salePrice: 55,
      catalog: true,
      details: "",
      imageUrls: [],
    };

    const result = await newProduct(payload);

    expect(result).toEqual({ success: "Producto cargado con éxito" });
    expect(db.productImage.createMany).not.toHaveBeenCalled();
  });

  it("should preserve legacy image when no imageUrls provided", async () => {
    const { db } = await import("@/lib/db");

    const payload = {
      id: "",
      code: "LEGACY",
      description: "Legacy image product",
      price: 100,
      gain: 20,
      amount: 10,
      unit: "Unidad",
      brand: "",
      category: "",
      subCategory: "",
      supplier: "",
      image: "https://legacy.com/img.jpg",
      imageName: "legacy.jpg",
      client_bonus: 0,
      salePrice: 120,
      catalog: true,
      details: "",
    };

    await newProduct(payload);

    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          image: "https://legacy.com/img.jpg",
          imageName: "legacy.jpg",
        }),
      }),
    );
  });
});

describe("updateProduct — multi-image support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete ProductImage rows when imagesToDelete is provided", async () => {
    const { db } = await import("@/lib/db");

    await updateProduct("product-1", {
      imagesToDelete: ["img-id-1", "img-id-2"],
    });

    expect(db.productImage.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["img-id-1", "img-id-2"] },
        productId: "product-1",
      },
    });
  });

  it("should create ProductImage rows when imageUrls are provided on update", async () => {
    const { db } = await import("@/lib/db");

    await updateProduct("product-1", {
      imageUrls: ["https://firebase.com/new1.jpg"],
    });

    expect(db.productImage.createMany).toHaveBeenCalledWith({
      data: [
        { productId: "product-1", url: "https://firebase.com/new1.jpg" },
      ],
    });
  });

  it("should handle both imageUrls and imagesToDelete in the same call", async () => {
    const { db } = await import("@/lib/db");

    await updateProduct("product-1", {
      imageUrls: ["https://firebase.com/new1.jpg"],
      imagesToDelete: ["old-img-id"],
    });

    expect(db.productImage.deleteMany).toHaveBeenCalled();
    expect(db.productImage.createMany).toHaveBeenCalled();
  });
});

describe("PublicProduct — images field", () => {
  it("should accept PublicProduct with images array", () => {
    const product: PublicProduct = {
      id: "p1",
      code: "PHOTO",
      description: "Has photos",
      brand: null,
      category: null,
      salePrice: 100,
      unit: "un",
      image: null,
      images: [],
      amount: 10,
      details: null,
    };

    expect(product.images).toEqual([]);
  });

  it("should fall back to legacy image when images array is empty", () => {
    const product: PublicProduct = {
      id: "p2",
      code: "FALLBACK",
      description: "Fallback",
      brand: null,
      category: null,
      salePrice: 50,
      unit: "un",
      image: "https://legacy.com/old.jpg",
      images: [],
      amount: 5,
      details: null,
    };

    const displayImages =
      product.images.length > 0
        ? product.images
        : product.image
          ? [product.image]
          : [];

    expect(displayImages).toEqual(["https://legacy.com/old.jpg"]);
  });

  it("should return empty array when both image and images are absent", () => {
    const product: PublicProduct = {
      id: "p3",
      code: "NONE",
      description: "No images",
      brand: null,
      category: null,
      salePrice: 25,
      unit: null,
      image: null,
      images: [],
      amount: 0,
      details: null,
    };

    expect(product.images).toHaveLength(0);
    expect(product.image).toBeNull();
  });
});
