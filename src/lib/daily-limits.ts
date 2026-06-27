import { db } from "@/lib/db";

/**
 * Get the start of today in UTC (midnight).
 */
function todayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Check and increment a daily limit counter.
 * Returns true if the limit was NOT exceeded (operation allowed).
 * Returns false if the limit IS exceeded (operation blocked).
 */
export async function checkDailyLimit(
  businessId: string,
  limitKey: "dailySalesLimit" | "dailyProductsLimit" | "dailyClientsLimit",
  currentCount: number
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const plan = await import("./plan-resolver").then((m) => m.getEffectivePlan(businessId));
  const limit = (plan as any)[limitKey] ?? 999999;

  if (currentCount >= limit) {
    return { allowed: false, used: currentCount, limit };
  }

  return { allowed: true, used: currentCount, limit };
}

/**
 * Increment the daily usage counter for a specific resource.
 */
export async function incrementDailyUsage(
  businessId: string,
  resource: "salesCount" | "productsCreated" | "clientsCreated"
): Promise<void> {
  const date = todayStart();

  await db.dailyUsage.upsert({
    where: { businessId_date: { businessId, date } },
    create: {
      businessId,
      date,
      [resource]: 1,
    },
    update: {
      [resource]: { increment: 1 },
    },
  });
}

/**
 * Get today's daily usage for a business.
 */
export async function getDailyUsage(businessId: string) {
  const date = todayStart();

  const usage = await db.dailyUsage.findUnique({
    where: { businessId_date: { businessId, date } },
  });

  return {
    salesCount: usage?.salesCount ?? 0,
    productsCreated: usage?.productsCreated ?? 0,
    clientsCreated: usage?.clientsCreated ?? 0,
  };
}
