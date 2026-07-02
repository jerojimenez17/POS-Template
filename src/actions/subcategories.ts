"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { assertWritePermission } from "@/lib/auth-gates";

export const getSubcategories = async (categoryId?: string) => {
  const session = await auth();
  if (!session?.user?.businessId) return [];

  try {
    return await db.subcategory.findMany({
      where: { 
        businessId: session.user.businessId,
        ...(categoryId ? { categoryId } : {})
      },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const createSubcategory = async (name: string, categoryId: string) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error, code: permission.code };

  try {
    const subcategory = await db.subcategory.create({
      data: {
        name,
        category: { connect: { id: categoryId } },
        business: { connect: { id: session.user.businessId } },
      },
    });
    revalidateTag(CACHE_TAGS.STOCK, "max");
    return { success: "Subcategoría creada", subcategory };
  } catch (error) {
    console.error(error);
    return { error: "Error al crear subcategoría" };
  }
};
