// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock `@/lib/db` ──
// Override the global mock from tests/setup.ts with a fresh instance that
// allows per-test spying on specific model methods.
// IMPORTANT: Only set DEFAULT implementations here. Individual tests MUST use
// `mockResolvedValueOnce()` (not `mockResolvedValue()`) when they need different
// return values, so that the default is restored for the next test.
vi.mock("@/lib/db", () => {
  const createMockFn = () => vi.fn();

  return {
    db: {
      $transaction: vi.fn().mockImplementation(async (arg: unknown) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        if (typeof arg === "function") return arg({});
        return arg;
      }),
      $executeRawUnsafe: createMockFn().mockResolvedValue(0),

      brand: {
        findMany: createMockFn().mockResolvedValue([]),
        createMany: createMockFn().mockResolvedValue({ count: 0 }),
        create: createMockFn().mockResolvedValue({
          id: "brand-1",
          name: "Test Brand",
        }),
      },
      category: {
        findMany: createMockFn().mockResolvedValue([]),
        createMany: createMockFn().mockResolvedValue({ count: 0 }),
        create: createMockFn().mockResolvedValue({
          id: "category-1",
          name: "Test Category",
        }),
      },
      subcategory: {
        findMany: createMockFn().mockResolvedValue([]),
        createMany: createMockFn().mockResolvedValue({ count: 0 }),
        create: createMockFn().mockResolvedValue({
          id: "subcategory-1",
          name: "Test Subcategory",
        }),
      },
      product: {
        findMany: createMockFn().mockResolvedValue([]),
        createMany: createMockFn().mockResolvedValue({ count: 1 }),
        create: createMockFn().mockResolvedValue({
          id: "product-1",
          code: "001",
        }),
        update: createMockFn().mockResolvedValue({ id: "product-1" }),
      },
      supplier: {
        update: createMockFn().mockResolvedValue({ id: "supplier-1" }),
      },
    },
  };
});

// Mock next/cache to prevent server-side revalidation calls from throwing.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// ── Helpers ──

/** Cast a mocked db method to its `vi.fn()` type for assertions. */
const asMock = (fn: unknown): ReturnType<typeof vi.fn> =>
  fn as ReturnType<typeof vi.fn>;

/**
 * Expected rounded prices for `filePrice=1000, discount=10, iva=21, gain=30`:
 *   costPrice  = Math.round(1000 * 0.9 * 1.21 / 10) * 10 = 1090
 *   salePrice  = Math.round(1090 * 1.3 / 10) * 10        = 1420
 *
 * Unrounded (current behaviour):
 *   costPrice  = 1000 * 0.9 * 1.21            = 1089
 *   salePrice  = 1089 * 1.3                    = 1415.7
 */
const FILE_PRICE = 1000;
const DISCOUNT = 10;
const IVA = 21;
const GAIN = 30;
const EXPECTED_COST_PRICE = 1090;
const EXPECTED_SALE_PRICE = 1420;
const UNROUNDED_COST_PRICE = 1089;
const UNROUNDED_SALE_PRICE = 1415.7;

// ── Tests ──

describe("Round Excel Prices — Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────
  //  stock.ts – previewProductsBulk
  // ──────────────────────────────────────────────────────

  describe("stock.ts – previewProductsBulk", () => {
    it("marks existing product as 'ignore' when DB prices match rounded values", async () => {
      const { db } = await import("@/lib/db");
      const { previewProductsBulk } = await import("@/actions/stock");

      // Existing product already has the ROUNDED prices.
      asMock(db.product.findMany).mockResolvedValueOnce([
        {
          code: "001",
          price: EXPECTED_COST_PRICE,
          salePrice: EXPECTED_SALE_PRICE,
          supplierId: null,
        },
      ]);

      const result = await previewProductsBulk(
        [{ code: "001", description: "Test Product", price: FILE_PRICE }],
        true, // updateExisting
        false, // updateOnly
        DISCOUNT,
        IVA,
        GAIN,
      );

      expect(result.success).toBe(true);
      // BEFORE: prices differ (1089 vs 1090) → status = "update"
      // AFTER:  prices match (1090 vs 1090)   → status = "ignore"
      expect(result.preview?.items[0].status).toBe("ignore");
    });

    it("marks existing product as 'update' when DB prices match UNrounded values (TDD pivot)", async () => {
      const { db } = await import("@/lib/db");
      const { previewProductsBulk } = await import("@/actions/stock");

      // Existing product has the UNROUNDED prices (as the code currently produces).
      asMock(db.product.findMany).mockResolvedValueOnce([
        {
          code: "001",
          price: UNROUNDED_COST_PRICE,
          salePrice: UNROUNDED_SALE_PRICE,
          supplierId: null,
        },
      ]);

      const result = await previewProductsBulk(
        [{ code: "001", description: "Test Product", price: FILE_PRICE }],
        true,
        false,
        DISCOUNT,
        IVA,
        GAIN,
      );

      expect(result.success).toBe(true);
      // BEFORE: prices match (1089 ≈ 1089) → status = "ignore"
      // AFTER:  prices differ (1090 ≠ 1089) → status = "update"
      expect(result.preview?.items[0].status).toBe("update");
    });

    it("marks existing product as 'update' when DB prices are completely different", async () => {
      const { db } = await import("@/lib/db");
      const { previewProductsBulk } = await import("@/actions/stock");

      asMock(db.product.findMany).mockResolvedValueOnce([
        {
          code: "001",
          price: 1080,
          salePrice: 1410,
          supplierId: null,
        },
      ]);

      const result = await previewProductsBulk(
        [{ code: "001", description: "Test Product", price: FILE_PRICE }],
        true,
        false,
        DISCOUNT,
        IVA,
        GAIN,
      );

      expect(result.success).toBe(true);
      expect(result.preview?.items[0].status).toBe("update");
    });
  });

  // ──────────────────────────────────────────────────
  //  stock.ts – processBulkProductBatch
  // ──────────────────────────────────────────────────

  describe("stock.ts – processBulkProductBatch", () => {
    it("creates new products with rounded costPrice and salePrice", async () => {
      const { db } = await import("@/lib/db");
      const { processBulkProductBatch } = await import("@/actions/stock");

      // No existing products → everything goes to db.product.createMany
      // All mocks use their defaults: findMany → [], createMany → { count: 1 }
      const result = (await processBulkProductBatch(
        [{ code: "001", description: "Test Product", price: FILE_PRICE }],
        false, // updateExisting
        false, // updateOnly
        DISCOUNT,
        IVA,
        GAIN,
      )) as { createdCount: number; updatedCount: number };

      expect(result.createdCount).toBe(1);
      expect(result.updatedCount).toBe(0);

      // Verify the data passed to createMany has ROUNDED prices.
      const createManyCalls = asMock(db.product.createMany).mock.calls;
      expect(createManyCalls.length).toBeGreaterThanOrEqual(1);

      const dataArg = createManyCalls[0][0].data as Array<Record<string, unknown>>;
      const productData = dataArg[0];
      // BEFORE: price = 1089, salePrice = 1415.7
      // AFTER:  price = 1090, salePrice = 1420
      expect(productData.price).toBe(EXPECTED_COST_PRICE);
      expect(productData.salePrice).toBe(EXPECTED_SALE_PRICE);

      // Also verify the gain field is present and correct.
      expect(productData.gain).toBe(GAIN);
    });

    it("detects price change when existing prices match UNrounded values (triggers update)", async () => {
      const { db } = await import("@/lib/db");
      const { processBulkProductBatch } = await import("@/actions/stock");

      // Existing product has UNROUNDED prices.
      asMock(db.product.findMany).mockResolvedValueOnce([
        {
          id: "prod-1",
          code: "001",
          price: UNROUNDED_COST_PRICE,
          salePrice: UNROUNDED_SALE_PRICE,
          gain: 25,
          amount: 10,
          supplierId: null,
        },
      ]);

      const result = (await processBulkProductBatch(
        [{ code: "001", description: "Test Product", price: FILE_PRICE }],
        true, // updateExisting = true → allow updates
        false,
        DISCOUNT,
        IVA,
        GAIN,
      )) as { createdCount: number; updatedCount: number };

      // BEFORE: prices match → skip (no update)       → updatedCount = 0
      // AFTER:  prices differ (1090 ≠ 1089) → trigger update → updatedCount = 1
      expect(result.updatedCount).toBe(1);
      expect(result.createdCount).toBe(0);

      // Must have used $executeRawUnsafe for the update.
      expect(asMock(db.$executeRawUnsafe).mock.calls.length).toBeGreaterThanOrEqual(
        1,
      );
    });
  });

  // ──────────────────────────────────────────────────
  //  bulk.ts – previewProductsBulk
  // ──────────────────────────────────────────────────

  describe("bulk.ts – previewProductsBulk", () => {
    it("marks existing product as 'ignore' when DB prices match rounded values", async () => {
      const { db } = await import("@/lib/db");
      const { previewProductsBulk } = await import("@/actions/stock/bulk");

      asMock(db.product.findMany).mockResolvedValueOnce([
        {
          code: "001",
          price: EXPECTED_COST_PRICE,
          salePrice: EXPECTED_SALE_PRICE,
          supplierId: null,
        },
      ]);

      const result = await previewProductsBulk(
        [{ code: "001", description: "Test Product", price: FILE_PRICE }],
        true,
        false,
        DISCOUNT,
        IVA,
        GAIN,
      );

      expect(result.success).toBe(true);
      // BEFORE: prices differ → "update"; AFTER: prices match → "ignore"
      expect(result.preview?.items[0].status).toBe("ignore");
    });

    it("marks existing product as 'update' when DB prices match UNrounded values", async () => {
      const { db } = await import("@/lib/db");
      const { previewProductsBulk } = await import("@/actions/stock/bulk");

      asMock(db.product.findMany).mockResolvedValueOnce([
        {
          code: "001",
          price: UNROUNDED_COST_PRICE,
          salePrice: UNROUNDED_SALE_PRICE,
          supplierId: null,
        },
      ]);

      const result = await previewProductsBulk(
        [{ code: "001", description: "Test Product", price: FILE_PRICE }],
        true,
        false,
        DISCOUNT,
        IVA,
        GAIN,
      );

      expect(result.success).toBe(true);
      // BEFORE: prices match → "ignore"; AFTER: prices differ → "update"
      expect(result.preview?.items[0].status).toBe("update");
    });
  });

  // ──────────────────────────────────────────────────
  //  bulk.ts – createProductsBulk
  // ──────────────────────────────────────────────────

  describe("bulk.ts – createProductsBulk", () => {
    it("creates new products with rounded costPrice and salePrice", async () => {
      const { db } = await import("@/lib/db");
      const { createProductsBulk } = await import("@/actions/stock/bulk");

      // No existing products → all go through db.product.create
      const result = await createProductsBulk(
        [{ code: "001", description: "Test Product", price: FILE_PRICE }],
        false, // updateExisting
        false, // updateOnly
        DISCOUNT,
        IVA,
        GAIN,
      );

      expect(result).toHaveProperty("success");

      // Verify db.product.create was called with ROUNDED prices.
      const createCalls = asMock(db.product.create).mock.calls;
      expect(createCalls.length).toBeGreaterThanOrEqual(1);

      const dataArg = createCalls[0][0].data as Record<string, unknown>;
      // BEFORE: price = 1089, salePrice = 1415.7
      // AFTER:  price = 1090, salePrice = 1420
      expect(dataArg.price).toBe(EXPECTED_COST_PRICE);
      expect(dataArg.salePrice).toBe(EXPECTED_SALE_PRICE);
    });

    it("updates existing products with rounded prices when they differ", async () => {
      const { db } = await import("@/lib/db");
      const { createProductsBulk } = await import("@/actions/stock/bulk");

      // Existing product has UNROUNDED prices.
      asMock(db.product.findMany).mockResolvedValueOnce([
        {
          id: "prod-1",
          code: "001",
          price: UNROUNDED_COST_PRICE,
          salePrice: UNROUNDED_SALE_PRICE,
          gain: 25,
          amount: 10,
          supplierId: null,
        },
      ]);

      const result = await createProductsBulk(
        [{ code: "001", description: "Test Product", price: FILE_PRICE }],
        true, // updateExisting = true
        false,
        DISCOUNT,
        IVA,
        GAIN,
      );

      expect(result).toHaveProperty("success");

      // BEFORE: prices match → skip (no update)          → db.product.update NOT called
      // AFTER:  prices differ (1090 ≠ 1089) → update     → db.product.update IS called
      const updateCalls = asMock(db.product.update).mock.calls;
      if (updateCalls.length > 0) {
        // If update was triggered, the data should contain rounded prices.
        const updateData = updateCalls[0][0].data as Record<string, unknown>;
        expect(updateData.price).toBe(EXPECTED_COST_PRICE);
        expect(updateData.salePrice).toBe(EXPECTED_SALE_PRICE);
      } else {
        // If NO update was triggered (BEFORE rounding change), the test fails the
        // overall expectation because our TDD assertion is that AFTER the change
        // the update IS triggered.
        expect(updateCalls.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
