import { useSession } from "next-auth/react";
import { Plan, BusinessStatus } from "@prisma/client";

export const useFeatures = () => {
  const { data: session } = useSession();
  const business = session?.user?.business || null;
  const features = business?.features || null;
  
  const plan = features?.plan || Plan.BASIC;
  const isDelinquent = business?.accountStatus === BusinessStatus.MOROSO;

  const hasFeature = (featureName: string): boolean => {
    if (!features) return false;
    return !!(features as Record<string, unknown>)[featureName];
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
    let limit = 0;
    if (limitName === "maxUsers") {
      limit = features?.maxUsers ?? 1;
    } else if (limitName === "maxProducts") {
      limit = features?.maxProducts ?? 100;
    } else {
      limit = (features as Record<string, unknown>)?.[limitName] as number ?? 0;
    }
    return value >= limit;
  };

  return {
    plan,
    isDelinquent,
    hasFeature,
    isPlanAtLeast,
    isOverLimit,
  };
};
