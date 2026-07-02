import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireFeature, assertLimit } from "@/lib/auth-gates";

// ─── Mock setup ───────────────────────────────────────────────────────────────

const mockAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/plan-resolver", () => ({
  getCachedPlan: vi.fn(),
}));

import { getCachedPlan } from "@/lib/plan-resolver";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const activeSession = () => ({
  user: {
    id: "user-1",
    businessId: "business-123",
    role: "ADMIN",
    business: { accountStatus: "ACTIVO", features: {} },
  },
});

const bareboneSession = () => ({
  user: {
    id: "user-1",
    businessId: null,
    role: null,
    business: null,
  },
});

const BASIC_PLAN = {
  plan: "BASIC",
  hasAfipBilling: false,
  hasPublicCatalog: false,
  hasClientLedger: false,
  hasMultiCashbox: false,
  hasSupplierFilter: false,
  hasBudget: false,
  maxUsers: 1,
  maxProducts: 100,
  maxCashboxes: 1,
  maxClients: 50,
  dailySalesLimit: 999999,
  dailyProductsLimit: 999999,
  dailyClientsLimit: 999999,
} as const;

const PRO_PLAN = {
  plan: "PRO",
  hasAfipBilling: true,
  hasPublicCatalog: true,
  hasClientLedger: true,
  hasMultiCashbox: true,
  hasSupplierFilter: true,
  hasBudget: true,
  maxUsers: 5,
  maxProducts: 1000,
  maxCashboxes: 3,
  maxClients: 500,
  dailySalesLimit: 999999,
  dailyProductsLimit: 999999,
  dailyClientsLimit: 999999,
} as const;

const FEATURE_NAMES = [
  "hasAfipBilling",
  "hasPublicCatalog",
  "hasClientLedger",
  "hasMultiCashbox",
  "hasSupplierFilter",
  "hasBudget",
] as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("requireFeature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth gates (inherited from assertWritePermission) ─────────────────────

  it("should fail with UNAUTHENTICATED when no session exists", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await requireFeature("hasAfipBilling");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Debes iniciar sesión para realizar esta acción.");
      expect(result.code).toBe("UNAUTHENTICATED");
    }
    expect(getCachedPlan).not.toHaveBeenCalled();
  });

  it("should fail with DELINQUENT when business status is MOROSO", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        businessId: "business-123",
        role: "ADMIN",
        business: { accountStatus: "MOROSO", features: {} },
      },
    } as any);

    const result = await requireFeature("hasAfipBilling");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Acción bloqueada. Tu cuenta posee facturas vencidas impagas.");
      expect(result.code).toBe("DELINQUENT");
    }
    expect(getCachedPlan).not.toHaveBeenCalled();
  });

  // ── No-businessId fallback ────────────────────────────────────────────────

  it("should succeed without checking plan when businessId is null (test/barebones fallback)", async () => {
    mockAuth.mockResolvedValue(bareboneSession() as any);

    const result = await requireFeature("hasAfipBilling");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessId).toBeNull();
    }
    expect(getCachedPlan).not.toHaveBeenCalled();
  });

  // ── Feature toggle ────────────────────────────────────────────────────────

  it("should fail with FORBIDDEN when feature is disabled in plan", async () => {
    mockAuth.mockResolvedValue(activeSession() as any);
    vi.mocked(getCachedPlan).mockResolvedValue(BASIC_PLAN as any);

    const result = await requireFeature("hasAfipBilling");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Esta función no está habilitada en tu plan actual.");
      expect(result.code).toBe("FORBIDDEN");
    }
  });

  it("should succeed when feature is enabled in plan", async () => {
    mockAuth.mockResolvedValue(activeSession() as any);
    vi.mocked(getCachedPlan).mockResolvedValue(PRO_PLAN as any);

    const result = await requireFeature("hasAfipBilling");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessId).toBe("business-123");
    }
  });

  // ── Parametric: every feature, disabled + enabled ─────────────────────────

  describe.each(FEATURE_NAMES)("feature flag: %s", (featureName) => {
    it("should fail with FORBIDDEN when disabled in plan", async () => {
      mockAuth.mockResolvedValue(activeSession() as any);
      vi.mocked(getCachedPlan).mockResolvedValue({
        ...BASIC_PLAN,
        [featureName]: false,
      } as any);

      const result = await requireFeature(featureName);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Esta función no está habilitada en tu plan actual.");
        expect(result.code).toBe("FORBIDDEN");
      }
    });

    it("should succeed when enabled in plan", async () => {
      mockAuth.mockResolvedValue(activeSession() as any);
      vi.mocked(getCachedPlan).mockResolvedValue({
        ...PRO_PLAN,
        [featureName]: true,
      } as any);

      const result = await requireFeature(featureName);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.businessId).toBe("business-123");
      }
    });
  });
});

// ─── assertLimit ──────────────────────────────────────────────────────────────

describe("assertLimit — auth gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fail with UNAUTHENTICATED when no session exists", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await assertLimit("maxProducts", 1);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("UNAUTHENTICATED");
      expect(result.error).toBe("Debes iniciar sesión para realizar esta acción.");
    }
    expect(getCachedPlan).not.toHaveBeenCalled();
  });

  it("should fail with DELINQUENT when business status is MOROSO", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        businessId: "business-123",
        role: "ADMIN",
        business: { accountStatus: "MOROSO", features: {} },
      },
    } as any);

    const result = await assertLimit("maxProducts", 1);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("DELINQUENT");
      expect(result.error).toBe("Acción bloqueada. Tu cuenta posee facturas vencidas impagas.");
    }
    expect(getCachedPlan).not.toHaveBeenCalled();
  });

  it("should succeed without checking plan when businessId is null", async () => {
    mockAuth.mockResolvedValue(bareboneSession() as any);

    const result = await assertLimit("maxProducts", 999);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessId).toBeNull();
    }
    expect(getCachedPlan).not.toHaveBeenCalled();
  });
});

describe("assertLimit — limit enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fail with LIMIT_EXCEEDED when value equals limit", async () => {
    mockAuth.mockResolvedValue(activeSession() as any);
    vi.mocked(getCachedPlan).mockResolvedValue(BASIC_PLAN as any);

    const result = await assertLimit("maxProducts", 100);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("LIMIT_EXCEEDED");
      expect(result.error).toContain("maxProducts");
      expect(result.error).toContain("100");
    }
  });

  it("should fail with LIMIT_EXCEEDED when value exceeds limit", async () => {
    mockAuth.mockResolvedValue(activeSession() as any);
    vi.mocked(getCachedPlan).mockResolvedValue(BASIC_PLAN as any);

    const result = await assertLimit("maxProducts", 101);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("LIMIT_EXCEEDED");
      expect(result.error).toContain("maxProducts");
    }
  });

  it("should succeed when value is below limit", async () => {
    mockAuth.mockResolvedValue(activeSession() as any);
    vi.mocked(getCachedPlan).mockResolvedValue(BASIC_PLAN as any);

    const result = await assertLimit("maxProducts", 99);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessId).toBe("business-123");
    }
  });

  it("should succeed when limit is null", async () => {
    mockAuth.mockResolvedValue(activeSession() as any);
    vi.mocked(getCachedPlan).mockResolvedValue({
      ...BASIC_PLAN,
      maxProducts: null,
    } as any);

    const result = await assertLimit("maxProducts", 999);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessId).toBe("business-123");
    }
  });

  it("should succeed when limit is undefined", async () => {
    mockAuth.mockResolvedValue(activeSession() as any);
    const plan = { ...BASIC_PLAN } as Record<string, unknown>;
    delete plan.maxProducts;
    vi.mocked(getCachedPlan).mockResolvedValue(plan as any);

    const result = await assertLimit("maxProducts", 999);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessId).toBe("business-123");
    }
  });
});

const LIMIT_NAMES = ["maxProducts", "maxUsers", "maxClients", "maxCashboxes"] as const;

describe.each(LIMIT_NAMES)("assertLimit — resource: %s", (limitName) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(activeSession() as any);
    vi.mocked(getCachedPlan).mockResolvedValue(BASIC_PLAN as any);
  });

  it("should fail with LIMIT_EXCEEDED when value equals limit", async () => {
    const limit = BASIC_PLAN[limitName as keyof typeof BASIC_PLAN];

    const result = await assertLimit(limitName, limit);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("LIMIT_EXCEEDED");
      expect(result.error).toContain(limitName);
    }
  });

  it("should succeed when value is one below limit", async () => {
    const limit = BASIC_PLAN[limitName as keyof typeof BASIC_PLAN];

    const result = await assertLimit(limitName, limit - 1);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessId).toBe("business-123");
    }
  });
});
