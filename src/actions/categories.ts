"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { assertWritePermission } from "@/lib/auth-gates";

export const getCategories = async () => {
  const session = await auth();
  if (!session?.user?.businessId) return [];

  try {
    return await db.category.findMany({
      where: { businessId: session.user.businessId },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const createCategory = async (name: string) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error, code: permission.code };

  try {
    const category = await db.category.create({
      data: {
        name,
        business: { connect: { id: session.user.businessId } },
      },
    });
    revalidateTag(CACHE_TAGS.STOCK, "max");
    return { success: "Categoría creada", category };
  } catch (error) {
    console.error(error);
    return { error: "Error al crear categoría" };
  }
};
