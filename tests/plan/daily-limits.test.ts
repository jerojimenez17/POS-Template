import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { checkDailyLimit, getDailyUsage, incrementDailyUsage } from "@/lib/daily-limits";

// ─── Helpers ─────────────────────────────────────────────────────────────────────
// checkDailyLimit uses a dynamic import (import("./plan-resolver")) at runtime,
// so test-level vi.mock won't intercept it. Instead we mock the DB directly:
// getEffectivePlan reads from db.businessFeatures.findUnique, which we control.
// The plan-resolver module imports db from @/lib/db, which is already mocked
// at the module level in tests/setup.ts — we just need to wire up the responses.

/**
 * Makes findUnique return a full DEMO plan definition.
 * DEMO daily limits: dailySalesLimit=3, dailyProductsLimit=5, dailyClientsLimit=2.
 */
function mockDemoPlan() {
  (db as any).businessFeatures = {
    findUnique: vi.fn().mockResolvedValue({
      planDefinition: {
        name: "DEMO",
        features: {
          hasAfipBilling: true,
          hasPublicCatalog: true,
          hasClientLedger: true,
          hasMultiCashbox: true,
          hasSupplierFilter: true,
          hasBudget: true,
        },
        limits: {
          maxUsers: 2,
          maxProducts: 10,
          maxCashboxes: 2,
          maxClients: 2,
          dailySalesLimit: 3,
          dailyProductsLimit: 5,
          dailyClientsLimit: 2,
        },
      },
      overrides: null,
      business: { trialEndsAt: null },
    }),
  };
}

/**
 * Makes findUnique return a CUSTOM plan with no daily limit keys.
 * This tests the 999999 fallback in checkDailyLimit.
 */
function mockPlanWithoutDailyLimits() {
  (db as any).businessFeatures = {
    findUnique: vi.fn().mockResolvedValue({
      planDefinition: {
        name: "CUSTOM",
        features: {
          hasAfipBilling: true,
          hasPublicCatalog: true,
          hasClientLedger: true,
          hasMultiCashbox: true,
          hasSupplierFilter: true,
          hasBudget: true,
        },
        limits: {
          maxUsers: 999,
          maxProducts: 999,
          // No daily limit keys — dailySalesLimit, dailyProductsLimit,
          // and dailyClientsLimit are all absent from the plan definition
        },
      },
      overrides: null,
      business: { trialEndsAt: null },
    }),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("checkDailyLimit — DEMO plan boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDemoPlan();
  });

  it("blocks sale when dailySalesLimit (3) is reached", async () => {
    const result = await checkDailyLimit("biz-1", "dailySalesLimit", 3);
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(3);
    expect(result.limit).toBe(3);
  });

  it("allows sale when under dailySalesLimit", async () => {
    const result = await checkDailyLimit("biz-1", "dailySalesLimit", 2);
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(2);
    expect(result.limit).toBe(3);
  });

  it("blocks product creation when dailyProductsLimit (5) is reached", async () => {
    const result = await checkDailyLimit("biz-1", "dailyProductsLimit", 5);
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(5);
    expect(result.limit).toBe(5);
  });

  it("allows product creation when under dailyProductsLimit", async () => {
    const result = await checkDailyLimit("biz-1", "dailyProductsLimit", 4);
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(4);
    expect(result.limit).toBe(5);
  });

  it("blocks client creation when dailyClientsLimit (2) is reached", async () => {
    const result = await checkDailyLimit("biz-1", "dailyClientsLimit", 2);
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(2);
    expect(result.limit).toBe(2);
  });

  it("allows client creation when under dailyClientsLimit", async () => {
    const result = await checkDailyLimit("biz-1", "dailyClientsLimit", 1);
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(1);
    expect(result.limit).toBe(2);
  });
});

describe("checkDailyLimit — structure and fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct { allowed, used, limit } shape", async () => {
    mockDemoPlan();
    const result = await checkDailyLimit("biz-1", "dailySalesLimit", 1);
    expect(result).toHaveProperty("allowed");
    expect(result).toHaveProperty("used");
    expect(result).toHaveProperty("limit");
  });

  it("falls back to 999999 when limit key is missing from plan", async () => {
    mockPlanWithoutDailyLimits();
    // 999999 >= 999999 → blocked
    const result = await checkDailyLimit("biz-1", "dailySalesLimit", 999999);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(999999);
    expect(result.used).toBe(999999);
  });

  it("allows any count under 999999 when limit key is missing", async () => {
    mockPlanWithoutDailyLimits();
    const result = await checkDailyLimit("biz-1", "dailyProductsLimit", 500);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(999999);
    expect(result.used).toBe(500);
  });
});

describe("getDailyUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zeros when no daily usage exists", async () => {
    (db as any).dailyUsage = {
      findUnique: vi.fn().mockResolvedValue(null),
    };

    const result = await getDailyUsage("biz-1");
    expect(result).toEqual({ salesCount: 0, productsCreated: 0, clientsCreated: 0 });
  });

  it("returns stored usage values", async () => {
    (db as any).dailyUsage = {
      findUnique: vi.fn().mockResolvedValue({
        salesCount: 2,
        productsCreated: 4,
        clientsCreated: 1,
      }),
    };

    const result = await getDailyUsage("biz-1");
    expect(result).toEqual({ salesCount: 2, productsCreated: 4, clientsCreated: 1 });
  });
});

describe("incrementDailyUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates new daily usage record on first increment", async () => {
    const upsertMock = vi.fn().mockResolvedValue({});
    (db as any).dailyUsage = { upsert: upsertMock };

    await incrementDailyUsage("biz-1", "salesCount");

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ businessId: "biz-1", salesCount: 1 }),
        update: expect.objectContaining({ salesCount: { increment: 1 } }),
      }),
    );
  });

  it("increments existing daily usage record", async () => {
    const upsertMock = vi.fn().mockResolvedValue({});
    (db as any).dailyUsage = { upsert: upsertMock };

    await incrementDailyUsage("biz-1", "productsCreated");

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ productsCreated: { increment: 1 } }),
      }),
    );
  });

  it("upserts for clientsCreated resource", async () => {
    const upsertMock = vi.fn().mockResolvedValue({});
    (db as any).dailyUsage = { upsert: upsertMock };

    await incrementDailyUsage("biz-1", "clientsCreated");

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ businessId: "biz-1", clientsCreated: 1 }),
        update: expect.objectContaining({ clientsCreated: { increment: 1 } }),
      }),
    );
  });
});
