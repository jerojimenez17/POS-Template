"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

export const getBrands = async () => {
  const session = await auth();
  if (!session?.user?.businessId) return [];

  try {
    return await db.brand.findMany({
      where: { businessId: session.user.businessId },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const createBrand = async (name: string) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    const brand = await db.brand.create({
      data: {
        name,
        business: { connect: { id: session.user.businessId } },
      },
    });
    revalidateTag(CACHE_TAGS.STOCK, "max");
    return { success: "Marca creada", brand };
  } catch (error) {
    console.error(error);
    return { error: "Error al crear marca" };
  }
};
