import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkLimit, getEffectivePlan } from "@/lib/plan-resolver";
import { db } from "@/lib/db";

// ─── Fixtures ──────────────────────────────────────────────────────────────────
// We control what getEffectivePlan returns by mocking db.businessFeatures.findUnique.
// When findUnique returns null, getEffectivePlan falls back to BASIC defaults.
// For other plans, we return a full BusinessFeatures object with the plan definition.

type DeepMock<T> = { [K in keyof T]: T[K] extends (...args: never[]) => unknown ? ReturnType<typeof vi.fn> & T[K] : T[K] };

/**
 * Makes findUnique return null → getEffectivePlan falls back to BASIC_DEFAULTS.
 * BASIC limits: maxProducts=100, maxUsers=1, maxClients=50, maxCashboxes=1.
 */
function mockBasicFallback() {
  (db as any).businessFeatures = {
    findUnique: vi.fn().mockResolvedValue(null),
  };
}

/**
 * Makes findUnique return a full business-features record for PRO plan.
 * PRO limits: maxProducts=1000, maxUsers=5, maxClients=500, maxCashboxes=3.
 */
function mockProPlan() {
  (db as any).businessFeatures = {
    findUnique: vi.fn().mockResolvedValue({
      planDefinition: {
        name: "PRO",
        features: {
          hasAfipBilling: true,
          hasPublicCatalog: true,
          hasClientLedger: true,
          hasMultiCashbox: true,
          hasSupplierFilter: true,
          hasBudget: true,
        },
        limits: {
          maxUsers: 5,
          maxProducts: 1000,
          maxCashboxes: 3,
          maxClients: 500,
          dailySalesLimit: 999999,
          dailyProductsLimit: 999999,
          dailyClientsLimit: 999999,
        },
      },
      business: { trialEndsAt: null },
      overrides: null,
    }),
  };
}

/**
 * Makes findUnique return a plan with null limits across all resources.
 */
function mockNullLimits() {
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
          maxUsers: null,
          maxProducts: null,
          maxCashboxes: null,
          maxClients: null,
          dailySalesLimit: null,
          dailyProductsLimit: null,
          dailyClientsLimit: null,
        },
      },
      business: { trialEndsAt: null },
      overrides: null,
    }),
  };
}

/**
 * Makes findUnique return a plan with undefined limits across all resources.
 */
function mockUndefinedLimits() {
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
          // All values explicitly undefined
        },
      },
      business: { trialEndsAt: null },
      overrides: null,
    }),
  };
}

/**
 * Makes findUnique return a DEMO plan with an expired trial.
 * Also mocks db.planDefinition.findUnique to return BASIC plan.
 * getEffectivePlan should auto-downgrade to BASIC.
 */
function mockExpiredDemoPlan() {
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
      business: { trialEndsAt: new Date("2020-01-01") }, // Expired!
    }),
  };
  (db as any).planDefinition = {
    findUnique: vi.fn().mockResolvedValue({
      name: "BASIC",
      features: {
        hasAfipBilling: false,
        hasPublicCatalog: false,
        hasClientLedger: false,
        hasMultiCashbox: false,
        hasSupplierFilter: false,
        hasBudget: false,
      },
      limits: {
        maxUsers: 1,
        maxProducts: 100,
        maxCashboxes: 1,
        maxClients: 50,
        dailySalesLimit: 999999,
        dailyProductsLimit: 999999,
        dailyClientsLimit: 999999,
      },
    }),
  };
}

/**
 * Makes findUnique return a DEMO plan with an active (future) trial.
 * Does NOT mock db.planDefinition — auto-downgrade should NOT trigger.
 */
function mockActiveDemoPlan() {
  const future = new Date();
  future.setFullYear(future.getFullYear() + 1);
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
      business: { trialEndsAt: future },
    }),
  };
}

type Resource = "products" | "users" | "clients" | "cashboxes";

interface ResourceTestCase {
  resource: Resource;
  limit: number;
  passesAt: number;
  throwsAt: number;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("checkLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Plan matrix: BASIC (fallback) ─────────────────────────────────────────
  // When findUnique returns null, getEffectivePlan falls back to BASIC defaults.
  // Tests boundary: count === limit → throws; count < limit → passes.

  describe("plan matrix — BASIC", () => {
    const resources: ResourceTestCase[] = [
      { resource: "products", limit: 100, passesAt: 99, throwsAt: 100 },
      { resource: "users", limit: 1, passesAt: 0, throwsAt: 1 },
      { resource: "clients", limit: 50, passesAt: 49, throwsAt: 50 },
      { resource: "cashboxes", limit: 1, passesAt: 0, throwsAt: 1 },
    ];

    beforeEach(() => {
      mockBasicFallback();
    });

    it.each(resources)(
      "throws when $resource count ($throwsAt) >= limit ($limit)",
      async ({ resource, throwsAt }) => {
        await expect(checkLimit("biz-1", resource, throwsAt)).rejects.toThrow(
          "Límite del plan alcanzado",
        );
      },
    );

    it.each(resources)(
      "passes when $resource count ($passesAt) < limit ($limit)",
      async ({ resource, passesAt }) => {
        await expect(checkLimit("biz-1", resource, passesAt)).resolves.toBeUndefined();
      },
    );
  });

  // ── Plan matrix: PRO ──────────────────────────────────────────────────────
  // Same boundary pattern for PRO plan limits from a full record.

  describe("plan matrix — PRO", () => {
    const resources: ResourceTestCase[] = [
      { resource: "products", limit: 1000, passesAt: 999, throwsAt: 1000 },
      { resource: "users", limit: 5, passesAt: 4, throwsAt: 5 },
      { resource: "clients", limit: 500, passesAt: 499, throwsAt: 500 },
      { resource: "cashboxes", limit: 3, passesAt: 2, throwsAt: 3 },
    ];

    beforeEach(() => {
      mockProPlan();
    });

    it.each(resources)(
      "throws when $resource count ($throwsAt) >= limit ($limit)",
      async ({ resource, throwsAt }) => {
        await expect(checkLimit("biz-1", resource, throwsAt)).rejects.toThrow(
          "Límite del plan alcanzado",
        );
      },
    );

    it.each(resources)(
      "passes when $resource count ($passesAt) < limit ($limit)",
      async ({ resource, passesAt }) => {
        await expect(checkLimit("biz-1", resource, passesAt)).resolves.toBeUndefined();
      },
    );
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    beforeEach(() => {
      mockBasicFallback();
    });

    it("count === limit → throws", async () => {
      await expect(checkLimit("biz-1", "products", 100)).rejects.toThrow();
    });

    it("count === limit - 1 → passes", async () => {
      await expect(checkLimit("biz-1", "products", 99)).resolves.toBeUndefined();
    });

    it("count === 0 → passes when limit > 0", async () => {
      await expect(checkLimit("biz-1", "products", 0)).resolves.toBeUndefined();
    });

    it("count > limit → throws with full error message", async () => {
      await expect(checkLimit("biz-1", "products", 999)).rejects.toThrow(
        "Límite del plan alcanzado: máximo 100 products. Mejora tu plan para ampliarlo.",
      );
    });
  });

  // ── Null / undefined limits ───────────────────────────────────────────────

  describe("null / undefined limits", () => {
    it("passes for any count when limit is null", async () => {
      mockNullLimits();
      await expect(checkLimit("biz-1", "products", 999999)).resolves.toBeUndefined();
    });

    it("passes for any count when limit is undefined", async () => {
      mockUndefinedLimits();
      await expect(checkLimit("biz-1", "products", 999999)).resolves.toBeUndefined();
    });

    it("passes for every resource type when limits are null", async () => {
      mockNullLimits();
      const resources: Resource[] = ["products", "users", "clients", "cashboxes"];
      for (const resource of resources) {
        await expect(checkLimit("biz-1", resource, 999999)).resolves.toBeUndefined();
      }
    });

    it("passes for every resource type when limits are undefined", async () => {
      mockUndefinedLimits();
      const resources: Resource[] = ["products", "users", "clients", "cashboxes"];
      for (const resource of resources) {
        await expect(checkLimit("biz-1", resource, 999999)).resolves.toBeUndefined();
      }
    });
  });

  // ── Error message format ──────────────────────────────────────────────────

  describe("error message format", () => {
    beforeEach(() => {
      mockBasicFallback();
    });

    it("includes limit value and resource name in error", async () => {
      await expect(checkLimit("biz-1", "products", 100)).rejects.toThrow(
        "Límite del plan alcanzado: máximo 100 products. Mejora tu plan para ampliarlo.",
      );
    });

    it("uses the correct limit for each resource type", async () => {
      const cases: Array<{ resource: Resource; count: number; fragment: string }> = [
        { resource: "products", count: 100, fragment: "máximo 100 products" },
        { resource: "users", count: 1, fragment: "máximo 1 users" },
        { resource: "clients", count: 50, fragment: "máximo 50 clients" },
        { resource: "cashboxes", count: 1, fragment: "máximo 1 cashboxes" },
      ];

      for (const { resource, count, fragment } of cases) {
        await expect(checkLimit("biz-1", resource, count)).rejects.toThrow(fragment);
      }
    });
  });

  // ── BusinessId propagation ────────────────────────────────────────────────

  describe("businessId propagation", () => {
    it("calls findUnique with the correct businessId", async () => {
      mockBasicFallback();
      await expect(checkLimit("business-123", "products", 0)).resolves.toBeUndefined();

      const findUnique = (db as any).businessFeatures.findUnique;
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { businessId: "business-123" } }),
      );
    });
  });
});

// ─── getEffectivePlan: DEMO auto-downgrade ──────────────────────────────────────

describe("getEffectivePlan — DEMO auto-downgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-downgrades to BASIC when DEMO trial has expired", async () => {
    mockExpiredDemoPlan();

    const result = await getEffectivePlan("biz-1");

    expect(result.plan).toBe("BASIC");
    expect(result.hasAfipBilling).toBe(false);
    expect(result.maxProducts).toBe(100);

    const findUnique = (db as any).planDefinition.findUnique;
    expect(findUnique).toHaveBeenCalledWith({ where: { name: "BASIC" } });
  });

  it("stays as DEMO when trial is still active", async () => {
    mockActiveDemoPlan();

    const result = await getEffectivePlan("biz-1");

    expect(result.plan).toBe("DEMO");
    expect(result.hasAfipBilling).toBe(true);
    expect(result.dailySalesLimit).toBe(3);
  });
});
