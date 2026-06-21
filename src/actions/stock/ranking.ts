"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";

export type RankedProduct = {
  id: string;
  code: string;
  nombre: string;
  price: number;
  ventas: number;
};

export const getProductRankingsAction = async (month: string) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return [];

  // Parse month string "yyyy-M" or "yyyy-MM"
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  if (isNaN(year) || isNaN(monthNum)) return [];

  try {
    const rankings = await db.productRanking.findMany({
      where: {
        businessId,
        year,
        month: monthNum,
        totalSold: { gt: 0 },
      },
      include: {
        product: {
          select: {
            code: true,
            description: true,
            salePrice: true,
          },
        },
      },
      orderBy: { totalSold: "desc" },
    });

    return rankings.map((r) => ({
      id: r.productId,
      code: r.product.code || "",
      nombre: r.product.description || "",
      price: r.product.salePrice,
      ventas: r.totalSold,
    }));
  } catch (error) {
    console.error("Error fetching product rankings:", error);
    return [];
  }
};
