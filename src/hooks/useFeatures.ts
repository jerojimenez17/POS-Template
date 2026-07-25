import { useSession } from "next-auth/react";
import { BusinessStatus } from "@prisma/client";
import type { ResolvedFeatures } from "@/types/plan";

/**
 * Client-side hook that returns the resolved plan features for the current user.
 *
 * The session JWT callback already resolves PlanDefinition + overrides into
 * a flat ResolvedFeatures shape at login time, so this is purely synchronous.
 *
 * SUPER_ADMIN users bypass all plan restrictions — they have access to every
 * feature regardless of the business plan.
 */
export const useFeatures = () => {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isSuperAdmin = role === "SUPER_ADMIN";
  const business = session?.user?.business || null;
  const features = business?.features as ResolvedFeatures | null;

  const plan = features?.plan ?? (isSuperAdmin ? "ENTERPRISE" : "BASIC");
  const isDelinquent = business?.accountStatus === BusinessStatus.MOROSO;

  const hasFeature = (featureName: string): boolean => {
    // SUPER_ADMIN always has access to every feature
    if (isSuperAdmin) return true;
    if (!features) return false;
    const f = features as unknown as Record<string, unknown>;
    return !!f[featureName];
  };

  const isPlanAtLeast = (requiredPlan: string): boolean => {
    // SUPER_ADMIN always passes plan level checks
    if (isSuperAdmin) return true;
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
    // SUPER_ADMIN has no limits
    if (isSuperAdmin) return false;
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
