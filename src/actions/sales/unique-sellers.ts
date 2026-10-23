"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";

export const getUniqueSellersAction = async (): Promise<string[]> => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return [];

  try {
    const sellers = await db.order.findMany({
      where: {
        businessId,
        seller: { not: null, notIn: [""] },
      },
      select: {
        seller: true,
      },
      distinct: ["seller"],
    });

    return sellers.flatMap(({ seller }) => (seller ? [seller] : []));
  } catch (error) {
    console.error("Error fetching unique sellers:", error);
    return [];
  }
};
