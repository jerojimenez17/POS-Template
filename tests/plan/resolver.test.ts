import { describe, it, expect } from "vitest";
import { resolveFeatures } from "@/lib/plan-resolver";
import { PLAN_SEEDS } from "@/types/plan";

/**
 * Feature flags that exist in every plan's `features` object.
 * These are the 6 booleans that control feature gating.
 */
const FEATURE_KEYS = [
  "hasAfipBilling",
  "hasPublicCatalog",
  "hasClientLedger",
  "hasMultiCashbox",
  "hasSupplierFilter",
  "hasBudget",
] as const;

type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * Expected feature values per plan name.
 * BASIC has all features disabled; PRO, ENTERPRISE, and DEMO have all enabled.
 */
const EXPECTED_FEATURE_VALUE: Record<string, boolean> = {
  BASIC: false,
  PRO: true,
  ENTERPRISE: true,
  DEMO: true,
};

/** Plans that are part of the documented matrix (excludes CUSTOM). */
const MATRIX_PLANS = PLAN_SEEDS.filter((p) =>
  ["BASIC", "PRO", "ENTERPRISE", "DEMO"].includes(p.name),
);

// ---------------------------------------------------------------------------
// Matrix test: 6 features × 4 plans = 24 combos
// ---------------------------------------------------------------------------

describe("resolveFeatures — feature matrix", () => {
  describe.each(MATRIX_PLANS)("Plan: $name", ({ name, features, limits }) => {
    const planDef = { features, limits };

    it.each(FEATURE_KEYS)("feature `%s` is %s", (featureKey: FeatureKey) => {
      const resolved = resolveFeatures(planDef, null, name);
      expect(resolved[featureKey]).toBe(EXPECTED_FEATURE_VALUE[name]);
    });

    it("sets plan name", () => {
      const resolved = resolveFeatures(planDef, null, name);
      expect(resolved.plan).toBe(name);
    });

    it("includes all limit fields with correct values", () => {
      const resolved = resolveFeatures(planDef, null, name);
      for (const [key, value] of Object.entries(limits)) {
        expect(resolved[key as keyof typeof resolved]).toBe(value);
      }
    });

    it("includes all feature fields", () => {
      const resolved = resolveFeatures(planDef, null, name);
      for (const key of FEATURE_KEYS) {
        expect(resolved).toHaveProperty(key);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Edge case: overrides take precedence over plan defaults
// ---------------------------------------------------------------------------

describe("resolveFeatures — overrides", () => {
  it("overrides plan defaults when key exists in merged object", () => {
    const basic = PLAN_SEEDS.find((p) => p.name === "BASIC")!;
    const resolved = resolveFeatures(
      { features: basic.features, limits: basic.limits },
      { hasAfipBilling: true },
      "BASIC",
    );

    // Override took effect
    expect(resolved.hasAfipBilling).toBe(true);

    // Other features remain at their plan default
    expect(resolved.hasPublicCatalog).toBe(false);
    expect(resolved.hasClientLedger).toBe(false);
    expect(resolved.hasMultiCashbox).toBe(false);
    expect(resolved.hasSupplierFilter).toBe(false);
    expect(resolved.hasBudget).toBe(false);
  });

  it("overrides a limit field", () => {
    const basic = PLAN_SEEDS.find((p) => p.name === "BASIC")!;
    const resolved = resolveFeatures(
      { features: basic.features, limits: basic.limits },
      { maxUsers: 10 },
      "BASIC",
    );

    expect(resolved.maxUsers).toBe(10);
    expect(resolved.maxProducts).toBe(100); // unchanged
  });

  it("does NOT inject keys that don't exist in the merged object", () => {
    const basic = PLAN_SEEDS.find((p) => p.name === "BASIC")!;
    const resolved = resolveFeatures(
      { features: basic.features, limits: basic.limits },
      { nonExistentKey: "anything" } as Record<string, unknown>,
      "BASIC",
    );

    // Valid override still works
    expect(resolved.hasAfipBilling).toBe(false);

    // Non-existent key is nowhere to be found
    expect((resolved as Record<string, unknown>).nonExistentKey).toBeUndefined();
  });

  it("does not crash when overrides is null", () => {
    const basic = PLAN_SEEDS.find((p) => p.name === "BASIC")!;
    const resolved = resolveFeatures(
      { features: basic.features, limits: basic.limits },
      null,
      "BASIC",
    );

    expect(resolved.hasAfipBilling).toBe(false);
    expect(resolved.maxUsers).toBe(1);
    expect(resolved.plan).toBe("BASIC");
  });

  it("does not crash when overrides is undefined", () => {
    const basic = PLAN_SEEDS.find((p) => p.name === "BASIC")!;
    const resolved = resolveFeatures(
      { features: basic.features, limits: basic.limits },
      undefined as unknown as null,
      "BASIC",
    );

    expect(resolved.hasAfipBilling).toBe(false);
    expect(resolved.plan).toBe("BASIC");
  });

  it("only overrides keys that exist in the merged features+limits", () => {
    const basic = PLAN_SEEDS.find((p) => p.name === "BASIC")!;
    const resolved = resolveFeatures(
      { features: basic.features, limits: basic.limits },
      {
        hasAfipBilling: true,
        maxProducts: 999,
        definitelyNotARealKey: "nope",
        alsoFake: 42,
      } as Record<string, unknown>,
      "BASIC",
    );

    // Real keys overridden
    expect(resolved.hasAfipBilling).toBe(true);
    expect(resolved.maxProducts).toBe(999);

    // Fake keys not injected
    const anyResolved = resolved as Record<string, unknown>;
    expect(anyResolved.definitelyNotARealKey).toBeUndefined();
    expect(anyResolved.alsoFake).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Edge case: default plan name fallback
// ---------------------------------------------------------------------------

describe("resolveFeatures — plan name fallback", () => {
  it("defaults to UNKNOWN when planName is omitted", () => {
    const basic = PLAN_SEEDS.find((p) => p.name === "BASIC")!;
    const resolved = resolveFeatures(
      { features: basic.features, limits: basic.limits },
      null,
    );

    expect(resolved.plan).toBe("UNKNOWN");
  });

  it("defaults to UNKNOWN when planName is undefined", () => {
    const basic = PLAN_SEEDS.find((p) => p.name === "BASIC")!;
    const resolved = resolveFeatures(
      { features: basic.features, limits: basic.limits },
      null,
      undefined,
    );

    expect(resolved.plan).toBe("UNKNOWN");
  });
});
