"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCachedPlan } from "@/lib/plan-resolver";

export interface TrialInfo {
  isTrial: boolean;
  daysLeft: number;
  trialEndsAt: Date | null;
  dailyLimits: {
    sales: number;
    products: number;
    clients: number;
  } | null;
}

export async function getTrialInfo(): Promise<TrialInfo | null> {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return null;

  try {
    const plan = await getCachedPlan(businessId);
    if (plan.plan !== "DEMO") {
      return { isTrial: false, daysLeft: 0, trialEndsAt: null, dailyLimits: null };
    }

    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { trialEndsAt: true },
    });

    if (!business?.trialEndsAt) {
      return { isTrial: true, daysLeft: 0, trialEndsAt: null, dailyLimits: null };
    }

    const now = new Date();
    const diffMs = business.trialEndsAt.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    return {
      isTrial: true,
      daysLeft,
      trialEndsAt: business.trialEndsAt,
      dailyLimits: {
        sales: (plan as any).dailySalesLimit ?? 999999,
        products: (plan as any).dailyProductsLimit ?? 999999,
        clients: (plan as any).dailyClientsLimit ?? 999999,
      },
    };
  } catch (e) {
    console.error("Error getting trial info:", e);
    return null;
  }
}
