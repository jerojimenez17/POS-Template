import { db } from "@/lib/db";
import { cache } from "react";
import type { ResolvedFeatures } from "@/types/plan";
import { PLAN_SEEDS } from "@/types/plan";

type JsonRecord = Record<string, unknown>;

/**
 * Hardcoded BASIC defaults — used as fallback when PlanDefinition is not seeded.
 * This ensures the system never crashes even if the seed hasn't been run.
 */
const BASIC_DEFAULTS: JsonRecord = {};
for (const seed of PLAN_SEEDS) {
  if (seed.name === "BASIC") {
    Object.assign(BASIC_DEFAULTS, seed.features, seed.limits);
    break;
  }
}
BASIC_DEFAULTS.plan = "BASIC";

/**
 * Pure merge function: overrides values take precedence over plan defaults.
 */
export function resolveFeatures(
  planDef: { features: JsonRecord; limits: JsonRecord },
  overrides: JsonRecord | null,
  planName?: string
): ResolvedFeatures {
  const merged: JsonRecord = {};
  const sources = [planDef.features, planDef.limits];

  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      merged[key] = value;
    }
  }

  // Apply overrides on top
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (key in merged) {
        merged[key] = value;
      }
    }
  }

  merged.plan = planName ?? "UNKNOWN";

  return merged as unknown as ResolvedFeatures;
}

/**
 * Loads BusinessFeatures + PlanDefinition from DB and resolves effective features.
 * Auto-downgrades DEMO plans to BASIC when trial has expired.
 * Falls back to BASIC defaults if PlanDefinition is not found.
 */
export async function getEffectivePlan(businessId: string): Promise<ResolvedFeatures> {
  const business = await db.business.findUnique({
    where: { id: businessId },
    include: { planDefinition: true },
  });

  if (!business) {
    // Business not found (shouldn't happen, but fallback gracefully)
    return BASIC_DEFAULTS as unknown as ResolvedFeatures;
  }

  if (!business.planDefinition) {
    // PlanDefinition not seeded yet — fall back to BASIC defaults
    console.warn(`PlanDefinition not found for business ${businessId}, falling back to BASIC`);
    return {
      ...BASIC_DEFAULTS,
    } as unknown as ResolvedFeatures;
  }

  // Auto-downgrade DEMO if trial expired
  if (business.planDefinition.name === "DEMO" && business.trialEndsAt && business.trialEndsAt < new Date()) {
    const basicPlan = await db.planDefinition.findUnique({ where: { name: "BASIC" } });
    if (basicPlan) {
      return resolveFeatures(
        {
          features: basicPlan.features as JsonRecord,
          limits: basicPlan.limits as JsonRecord,
        },
        null,
        "BASIC"
      );
    }
  }

  const planDef = {
    features: business.planDefinition.features as JsonRecord,
    limits: business.planDefinition.limits as JsonRecord,
  };

  const resolved = resolveFeatures(planDef, null, business.planDefinition.name);

  return resolved;
}

/**
 * Cached version of getEffectivePlan for use within the same request.
 * Uses React.cache() for request-scoped deduplication.
 */
export const getCachedPlan = cache(getEffectivePlan);

/**
 * Checks if a business has capacity for a given resource.
 * Throws a descriptive error if the limit is reached.
 *
 * Use this in server actions that create resources (products, users, clients).
 * The `resource` key maps to the PlanDefinition.limits field (e.g. "products" → "maxProducts").
 */
export async function checkLimit(
  businessId: string,
  resource: "products" | "users" | "clients" | "cashboxes",
  currentCount: number
): Promise<void> {
  const plan = await getCachedPlan(businessId);
  const key = `max${resource.charAt(0).toUpperCase() + resource.slice(1)}` as keyof typeof plan;
  const limit = plan[key] as number;

  if (limit !== null && limit !== undefined && currentCount >= limit) {
    throw new Error(
      `Límite del plan alcanzado: máximo ${limit} ${resource}. Mejora tu plan para ampliarlo.`
    );
  }
}

/**
 * Resolves plan from a user object (used in JWT callback).
 * The user object already has business.planDefinition loaded.
 */
export function resolvePlanFromBusiness(
  business: {
    planDefinition: { name?: string; features: unknown; limits: unknown } | null;
  }
): ResolvedFeatures | null {
  if (!business.planDefinition) return null;

  const planDef = {
    features: business.planDefinition.features as JsonRecord,
    limits: business.planDefinition.limits as JsonRecord,
  };

  return resolveFeatures(
    planDef,
    null,
    business.planDefinition.name ?? "UNKNOWN"
  );
}
