import { db } from "@/lib/db";
import { cache } from "react";
import type { ResolvedFeatures } from "@/types/plan";

/**
 * Pure merge function: overrides values take precedence over plan defaults.
 */
export function resolveFeatures(
  planDef: { features: Record<string, any>; limits: Record<string, any> },
  overrides: Record<string, any> | null,
  planName?: string
): ResolvedFeatures {
  const merged: Record<string, any> = {};
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
 * Throws if PlanDefinition is not found.
 */
export async function getEffectivePlan(businessId: string): Promise<ResolvedFeatures> {
  const bf = await db.businessFeatures.findUnique({
    where: { businessId },
    include: {
      planDefinition: true,
      business: { select: { trialEndsAt: true } },
    },
  });

  if (!bf) {
    throw new Error(`BusinessFeatures not found for business ${businessId}`);
  }
  if (!bf.planDefinition) {
    throw new Error(`PlanDefinition not found for business ${businessId}`);
  }

  // Auto-downgrade DEMO if trial expired
  if (bf.planDefinition.name === "DEMO" && bf.business.trialEndsAt && bf.business.trialEndsAt < new Date()) {
    const basicPlan = await db.planDefinition.findUnique({ where: { name: "BASIC" } });
    if (basicPlan) {
      return resolveFeatures(
        {
          features: basicPlan.features as Record<string, any>,
          limits: basicPlan.limits as Record<string, any>,
        },
        null,
        "BASIC"
      );
    }
  }

  const planDef = {
    features: bf.planDefinition.features as Record<string, any>,
    limits: bf.planDefinition.limits as Record<string, any>,
  };

  const resolved = resolveFeatures(planDef, bf.overrides as Record<string, any> | null, bf.planDefinition.name);

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
 * The user object already has business.features with planDefinition loaded.
 */
export function resolvePlanFromBusiness(
  business: {
    features: {
      planDefinition: { name?: string; features: unknown; limits: unknown } | null;
      overrides: unknown;
    } | null;
  }
): ResolvedFeatures | null {
  if (!business.features?.planDefinition) return null;

  const planDef = {
    features: business.features.planDefinition.features as Record<string, any>,
    limits: business.features.planDefinition.limits as Record<string, any>,
  };

  return resolveFeatures(
    planDef,
    business.features.overrides as Record<string, any> | null,
    business.features.planDefinition.name ?? "UNKNOWN"
  );
}
