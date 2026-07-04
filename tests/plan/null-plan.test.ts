import { describe, it, expect, vi, beforeEach } from "vitest";
import { getEffectivePlan } from "@/lib/plan-resolver";
import { db } from "@/lib/db";

describe("getEffectivePlan — null planDefinition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns BASIC defaults when planDefinition is null on business", async () => {
    (db as any).business = {
      findUnique: vi.fn().mockResolvedValue({
        id: "biz-1",
        planDefinition: null,
        trialEndsAt: null,
      }),
    };

    const result = await getEffectivePlan("biz-1");

    expect(result.plan).toBe("BASIC");
    expect(result.maxUsers).toBe(1);
    expect(result.maxProducts).toBe(100);
    expect(result.maxClients).toBe(50);
    expect(result.maxCashboxes).toBe(1);
    expect(result.hasAfipBilling).toBe(false);
    expect(result.hasPublicCatalog).toBe(false);
    expect(result.hasClientLedger).toBe(false);
    expect(result.hasMultiCashbox).toBe(false);
    expect(result.hasSupplierFilter).toBe(false);
    expect(result.hasBudget).toBe(false);
  });

  it("returns BASIC defaults when business is not found (null)", async () => {
    (db as any).business = {
      findUnique: vi.fn().mockResolvedValue(null),
    };

    const result = await getEffectivePlan("nonexistent");

    expect(result.plan).toBe("BASIC");
    expect(result.maxUsers).toBe(1);
    expect(result.maxProducts).toBe(100);
  });
});
