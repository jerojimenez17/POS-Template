import { useSession } from "next-auth/react";
import { Plan, BusinessStatus } from "@prisma/client";

/**
 * Client-side hook that resolves the effective plan features for the current user.
 *
 * Mirrors the same resolution logic as `resolveFeatures()` in `plan-resolver.ts`:
 * PlanDefinition defaults → overlaid with BusinessFeatures overrides.
 *
 * The session already includes the full BusinessFeatures + PlanDefinition relation,
 * so this is synchronous — no extra server requests.
 */
export const useFeatures = () => {
  const { data: session } = useSession();
  const business = session?.user?.business || null;
  const rawFeatures = business?.features || null;

  // Resolve effective features from PlanDefinition + overrides
  const planDef = rawFeatures?.planDefinition as {
    name?: string;
    features?: Record<string, unknown>;
    limits?: Record<string, unknown>;
  } | null;

  const defaults: Record<string, unknown> = {
    ...(planDef?.features ?? {}),
    ...(planDef?.limits ?? {}),
  };

  const overrides = (rawFeatures?.overrides ?? {}) as Record<string, unknown>;
  const resolved: Record<string, unknown> = { ...defaults };

  for (const [key, value] of Object.entries(overrides)) {
    if (key in resolved) {
      resolved[key] = value;
    }
  }

  const planName = planDef?.name as string | undefined;
  const plan = (planName as Plan) || Plan.BASIC;
  const isDelinquent = business?.accountStatus === BusinessStatus.MOROSO;

  const hasFeature = (featureName: string): boolean => {
    return !!(resolved as Record<string, unknown>)[featureName];
  };

  const isPlanAtLeast = (requiredPlan: Plan): boolean => {
    const planHierarchy: Record<Plan, number> = {
      [Plan.BASIC]: 1,
      [Plan.PRO]: 2,
      [Plan.ENTERPRISE]: 3,
    };
    const currentPlanValue = planHierarchy[plan] || 1;
    const requiredPlanValue = planHierarchy[requiredPlan] || 1;
    return currentPlanValue >= requiredPlanValue;
  };

  const isOverLimit = (limitName: string, value: number): boolean => {
    const limit = (resolved as Record<string, unknown>)[limitName] as number | undefined;
    return limit !== undefined && value >= limit;
  };

  return {
    plan,
    isDelinquent,
    hasFeature,
    isPlanAtLeast,
    isOverLimit,
  };
};
