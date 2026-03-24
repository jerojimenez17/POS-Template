"use server";

import { db } from "@/lib/db";

export interface PublicProduct {
  id: string;
  code: string | null;
  description: string | null;
  brand: string | null;
  category: string | null;
  salePrice: number;
  unit: string | null;
  image: string | null;
  amount: number;
}

export const getPublicProductsByBusinessId = async (businessId: string): Promise<PublicProduct[]> => {
  try {
    const products = await db.product.findMany({
      where: {
        businessId: businessId,
        salePrice: { gt: 0 },
      },
      select: {
        id: true,
        code: true,
        description: true,
        salePrice: true,
        unit: true,
        image: true,
        amount: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { description: "asc" },
    });

    return products.map((p) => ({
      id: p.id,
      code: p.code,
      description: p.description,
      brand: p.brand?.name ?? null,
      category: p.category?.name ?? null,
      salePrice: p.salePrice,
      unit: p.unit,
      image: p.image,
      amount: p.amount,
    }));
  } catch (error) {
    console.error("Error fetching public products:", error);
    return [];
  }
};
