import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getShortcutConfigsAction,
  saveShortcutConfigAction,
  deleteShortcutConfigAction,
  getProductByShortcutAction,
} from "@/actions/shortcuts";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  db: {
    shortcutConfig: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    product: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Shortcut Server Actions", () => {
  const mockBusinessId = "business-123";
  const mockProduct = {
    id: "product-1",
    code: "VAR001",
    description: "Producto Precio Variable",
    salePrice: 0,
    price: 0,
    gain: 0,
    unit: "unidades",
    image: "",
    imageName: "",
    images: [],
    brand: "",
    subCategory: "",
    category: "",
    suplier: { id: "s1", name: "Test" },
    client_bonus: 0,
    amount: 0,
    last_update: new Date(),
    creation_date: new Date(),
    catalog: true,
    details: "",
    codebar: "",
  };

  const mockConfigView = {
    id: "config-1",
    key: "F1" as const,
    productId: "product-1",
    product: {
      id: "product-1",
      description: "Producto Precio Variable",
      code: "VAR001",
      salePrice: 0,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────── Authentication ─────────

  it("should return 'No autorizado' when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const result1 = await getShortcutConfigsAction(mockBusinessId);
    expect(result1).toEqual({ error: "No autorizado" });

    const result2 = await saveShortcutConfigAction(mockBusinessId, "F1", "product-1");
    expect(result2).toEqual({ error: "No autorizado" });

    const result3 = await deleteShortcutConfigAction(mockBusinessId, "F1");
    expect(result3).toEqual({ error: "No autorizado" });

    const result4 = await getProductByShortcutAction("F1");
    expect(result4).toEqual({ error: "No autorizado" });
  });

  it("should return 'No autorizado' when session has no businessId", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1" },
      expires: "1",
    });

    const result1 = await getShortcutConfigsAction(mockBusinessId);
    expect(result1).toEqual({ error: "No autorizado" });

    const result2 = await saveShortcutConfigAction(mockBusinessId, "F1", "product-1");
    expect(result2).toEqual({ error: "No autorizado" });

    const result3 = await deleteShortcutConfigAction(mockBusinessId, "F1");
    expect(result3).toEqual({ error: "No autorizado" });

    const result4 = await getProductByShortcutAction("F1");
    expect(result4).toEqual({ error: "No autorizado" });
  });

  // ───────── getShortcutConfigsAction ─────────

  it("should return configs for a valid business", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    const mockDbConfigs = [
      {
        id: "config-1",
        businessId: mockBusinessId,
        key: "F1",
        productId: "product-1",
        product: {
          id: "product-1",
          description: "Producto Precio Variable",
          code: "VAR001",
          salePrice: 0,
        },
      },
      {
        id: "config-2",
        businessId: mockBusinessId,
        key: "F2",
        productId: "product-2",
        product: null,
      },
    ];

    vi.mocked(db.shortcutConfig.findMany).mockResolvedValue(mockDbConfigs);

    const result = await getShortcutConfigsAction(mockBusinessId);

    expect(result).toEqual({ success: true, data: mockDbConfigs });
    expect(db.shortcutConfig.findMany).toHaveBeenCalledWith({
      where: { businessId: mockBusinessId },
      include: {
        product: {
          select: { id: true, description: true, code: true, salePrice: true },
        },
      },
    });
  });

  it("should return empty array when no configs exist", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    vi.mocked(db.shortcutConfig.findMany).mockResolvedValue([]);

    const result = await getShortcutConfigsAction(mockBusinessId);

    expect(result).toEqual({ success: true, data: [] });
  });

  it("should handle database error in getShortcutConfigsAction", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    vi.mocked(db.shortcutConfig.findMany).mockRejectedValue(
      new Error("Database connection failed")
    );

    const result = await getShortcutConfigsAction(mockBusinessId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
    }
  });

  // ───────── saveShortcutConfigAction ─────────

  it("should create a new shortcut config (upsert insert)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    const createdConfig = {
      id: "config-new",
      businessId: mockBusinessId,
      key: "F3",
      productId: "product-3",
      product: {
        id: "product-3",
        description: "Nuevo Producto",
        code: "NEW003",
        salePrice: 0,
      },
    };

    vi.mocked(db.shortcutConfig.upsert).mockResolvedValue(createdConfig);

    const result = await saveShortcutConfigAction(mockBusinessId, "F3", "product-3");

    expect(result).toEqual({ success: true, data: createdConfig });
    expect(db.shortcutConfig.upsert).toHaveBeenCalledWith({
      where: {
        businessId_key: { businessId: mockBusinessId, key: "F3" },
      },
      update: { productId: "product-3" },
      create: {
        businessId: mockBusinessId,
        key: "F3",
        productId: "product-3",
      },
      include: {
        product: {
          select: { id: true, description: true, code: true, salePrice: true },
        },
      },
    });
  });

  it("should update an existing shortcut config (upsert update)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    const updatedConfig = {
      id: "config-1",
      businessId: mockBusinessId,
      key: "F1",
      productId: "product-2",
      product: {
        id: "product-2",
        description: "Producto Actualizado",
        code: "UPD002",
        salePrice: 0,
      },
    };

    vi.mocked(db.shortcutConfig.upsert).mockResolvedValue(updatedConfig);

    const result = await saveShortcutConfigAction(mockBusinessId, "F1", "product-2");

    expect(result).toEqual({ success: true, data: updatedConfig });
    expect(db.shortcutConfig.upsert).toHaveBeenCalledWith({
      where: {
        businessId_key: { businessId: mockBusinessId, key: "F1" },
      },
      update: { productId: "product-2" },
      create: {
        businessId: mockBusinessId,
        key: "F1",
        productId: "product-2",
      },
      include: {
        product: {
          select: { id: true, description: true, code: true, salePrice: true },
        },
      },
    });
  });

  it("should validate that key is one of F1, F2, F3", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    const result = await saveShortcutConfigAction(
      mockBusinessId,
      "F4" as any,
      "product-1"
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
    expect(db.shortcutConfig.upsert).not.toHaveBeenCalled();
  });

  it("should validate that productId is not empty", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    const result = await saveShortcutConfigAction(mockBusinessId, "F1", "");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Producto");
    }
    expect(db.shortcutConfig.upsert).not.toHaveBeenCalled();
  });

  it("should handle database error in saveShortcutConfigAction", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    vi.mocked(db.shortcutConfig.upsert).mockRejectedValue(
      new Error("Unique constraint violation")
    );

    const result = await saveShortcutConfigAction(mockBusinessId, "F1", "product-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  // ───────── deleteShortcutConfigAction ─────────

  it("should delete an existing shortcut config", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    vi.mocked(db.shortcutConfig.delete).mockResolvedValue({
      id: "config-1",
      businessId: mockBusinessId,
      key: "F1",
      productId: "product-1",
    });

    const result = await deleteShortcutConfigAction(mockBusinessId, "F1");

    expect(result).toEqual({ success: true });
    expect(db.shortcutConfig.delete).toHaveBeenCalledWith({
      where: {
        businessId_key: { businessId: mockBusinessId, key: "F1" },
      },
    });
  });

  it("should handle error when deleting non-existent config", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    vi.mocked(db.shortcutConfig.delete).mockRejectedValue(
      new Error("Record to delete does not exist")
    );

    const result = await deleteShortcutConfigAction(mockBusinessId, "F1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  // ───────── getProductByShortcutAction ─────────

  it("should return product when shortcut is configured", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    const mockShortcutConfig = {
      id: "config-1",
      businessId: mockBusinessId,
      key: "F1",
      productId: "product-1",
      product: mockProduct,
    };

    vi.mocked(db.shortcutConfig.findUnique).mockResolvedValue(mockShortcutConfig);

    const result = await getProductByShortcutAction("F1");

    expect(result).toEqual({ success: true, data: mockProduct });
    expect(db.shortcutConfig.findUnique).toHaveBeenCalledWith({
      where: {
        businessId_key: { businessId: mockBusinessId, key: "F1" },
      },
      include: { product: true },
    });
  });

  it("should return null when shortcut is not configured", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    vi.mocked(db.shortcutConfig.findUnique).mockResolvedValue(null);

    const result = await getProductByShortcutAction("F1");

    expect(result).toEqual({ success: true, data: null });
  });

  it("should handle database error in getProductByShortcutAction", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    vi.mocked(db.shortcutConfig.findUnique).mockRejectedValue(
      new Error("Database connection failed")
    );

    const result = await getProductByShortcutAction("F1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  // ─── Bug A: missing { success: true, data: null } handling ───

  it("should return { success: true, data: null } when config exists but product is null (Bug A)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    // Simulate a config record where the related Product has been deleted
    const mockShortcutConfig = {
      id: "config-1",
      businessId: mockBusinessId,
      key: "F1",
      productId: "deleted-product",
      product: null, // product relation is null (FK orphan)
    };

    vi.mocked(db.shortcutConfig.findUnique).mockResolvedValue(mockShortcutConfig);

    const result = await getProductByShortcutAction("F1");

    expect(result).toEqual({ success: true, data: null });
    expect(db.shortcutConfig.findUnique).toHaveBeenCalledWith({
      where: {
        businessId_key: { businessId: mockBusinessId, key: "F1" },
      },
      include: { product: true },
    });
  });

  it("should use overrideBusinessId when provided to getProductByShortcutAction (Bug A fix)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId }, // session has "business-123"
      expires: "1",
    });

    const overrideBusinessId = "other-business-456";
    const mockShortcutConfig = {
      id: "config-1",
      businessId: overrideBusinessId,
      key: "F1",
      productId: "product-1",
      product: mockProduct,
    };

    vi.mocked(db.shortcutConfig.findUnique).mockResolvedValue(mockShortcutConfig);

    // Calling with overrideBusinessId — the server action should use it instead of session's businessId
    const result = await getProductByShortcutAction("F1", overrideBusinessId as any);

    expect(result).toEqual({ success: true, data: mockProduct });
    expect(db.shortcutConfig.findUnique).toHaveBeenCalledWith({
      where: {
        businessId_key: { businessId: overrideBusinessId, key: "F1" },
      },
      include: { product: true },
    });
  });

  // ─── Bug B: getShortcutConfigsAction with null product relation ───

  it("should include configs with null product relation in getShortcutConfigsAction results (Bug B)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: mockBusinessId },
      expires: "1",
    });

    const configWithProduct = {
      id: "config-1",
      businessId: mockBusinessId,
      key: "F1",
      productId: "product-1",
      product: {
        id: "product-1",
        description: "Test Product",
        code: "TST001",
        salePrice: 10,
      },
    };

    const configWithoutProduct = {
      id: "config-2",
      businessId: mockBusinessId,
      key: "F2",
      productId: "deleted-product",
      product: null,
    };

    vi.mocked(db.shortcutConfig.findMany).mockResolvedValue([configWithProduct, configWithoutProduct]);

    const result = await getShortcutConfigsAction(mockBusinessId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      // Config with valid product
      expect(result.data[0].product).not.toBeNull();
      expect(result.data[0].product?.id).toBe("product-1");
      // Config with deleted product — product must be null, NOT filtered out
      expect(result.data[1].product).toBeNull();
    }
  });
});
