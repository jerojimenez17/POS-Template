import { useSession } from "next-auth/react";
import { BusinessStatus } from "@prisma/client";
import type { ResolvedFeatures } from "@/types/plan";

/**
 * Client-side hook that returns the resolved plan features for the current user.
 *
 * The session JWT callback already resolves PlanDefinition + overrides into
 * a flat ResolvedFeatures shape at login time, so this is purely synchronous.
 */
export const useFeatures = () => {
  const { data: session } = useSession();
  const business = session?.user?.business || null;
  const features = business?.features as ResolvedFeatures | null;

  const plan = features?.plan ?? "BASIC";
  const isDelinquent = business?.accountStatus === BusinessStatus.MOROSO;

  const hasFeature = (featureName: string): boolean => {
    if (!features) return false;
    const f = features as unknown as Record<string, unknown>;
    return !!f[featureName];
  };

  const isPlanAtLeast = (requiredPlan: string): boolean => {
    const planHierarchy: Record<string, number> = {
      BASIC: 1,
      PRO: 2,
      ENTERPRISE: 3,
    };
    const current = planHierarchy[plan] ?? 1;
    const required = planHierarchy[requiredPlan] ?? 1;
    return current >= required;
  };

  const isOverLimit = (limitName: string, value: number): boolean => {
    if (!features) return false;
    const f = features as unknown as Record<string, unknown>;
    const limit = f[limitName] as number | undefined;
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
