import { db } from "@/lib/db";
import { cache } from "react";
import type { ResolvedFeatures } from "@/types/plan";

/**
 * Pure merge function: overrides values take precedence over plan defaults.
 */
export function resolveFeatures(
  planDef: { features: Record<string, any>; limits: Record<string, any> },
  overrides: Record<string, any> | null
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

  return merged as unknown as ResolvedFeatures;
}

/**
 * Loads BusinessFeatures + PlanDefinition from DB and resolves effective features.
 * Throws if PlanDefinition is not found.
 */
export async function getEffectivePlan(businessId: string): Promise<ResolvedFeatures> {
  const bf = await db.businessFeatures.findUnique({
    where: { businessId },
    include: { planDefinition: true },
  });

  if (!bf) {
    throw new Error(`BusinessFeatures not found for business ${businessId}`);
  }
  if (!bf.planDefinition) {
    throw new Error(`PlanDefinition not found for business ${businessId}`);
  }

  const planDef = {
    features: bf.planDefinition.features as Record<string, any>,
    limits: bf.planDefinition.limits as Record<string, any>,
  };

  return resolveFeatures(planDef, bf.overrides as Record<string, any> | null);
}

/**
 * Cached version of getEffectivePlan for use within the same request.
 * Uses React.cache() for request-scoped deduplication.
 */
export const getCachedPlan = cache(getEffectivePlan);

/**
 * Resolves plan from a user object (used in JWT callback).
 * The user object already has business.features with planDefinition loaded.
 */
export function resolvePlanFromBusiness(
  business: {
    features: {
      planDefinition: { features: unknown; limits: unknown } | null;
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
    business.features.overrides as Record<string, any> | null
  );
}
