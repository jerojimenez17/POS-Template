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
  details: string | null;
  catalog?: boolean;
}

export const getPublicProductsByBusinessId = async (businessId: string): Promise<PublicProduct[]> => {
  const features = await db.businessFeatures.findUnique({
    where: { businessId: businessId },
  });

  if (!features || !features.hasPublicCatalog) {
    throw new Error("El catálogo público no está habilitado para este negocio.");
  }

  try {
    const products = await db.product.findMany({
      where: {
        businessId: businessId,
        salePrice: { gt: 0 },
        catalog: true,
      },
      select: {
        id: true,
        code: true,
        description: true,
        salePrice: true,
        unit: true,
        image: true,
        amount: true,
        catalog: true,
        details: true,
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
      catalog: p.catalog,
      details: p.details,
    }));
  } catch (error) {
    console.error("Error fetching public products:", error);
    return [];
  }
};

export const getPublicProductById = async (
  businessId: string,
  productId: string
): Promise<PublicProduct | null> => {
  try {
    const product = await db.product.findFirst({
      where: {
        id: productId,
        businessId: businessId,
        salePrice: { gt: 0 },
        catalog: true,
      },
      select: {
        id: true,
        code: true,
        description: true,
        salePrice: true,
        unit: true,
        image: true,
        amount: true,
        catalog: true,
        details: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
    });

    if (!product) return null;

    return {
      id: product.id,
      code: product.code,
      description: product.description,
      brand: product.brand?.name ?? null,
      category: product.category?.name ?? null,
      salePrice: product.salePrice,
      unit: product.unit,
      image: product.image,
      amount: product.amount,
      catalog: product.catalog,
      details: product.details,
    };
  } catch (error) {
    console.error("Error fetching public product:", error);
    return null;
  }
};
