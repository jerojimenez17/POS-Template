"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidatePath } from "next/cache";

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

  try {
    const category = await db.category.create({
      data: {
        name,
        business: { connect: { id: session.user.businessId } },
      },
    });
    revalidatePath("/stock");
    return { success: "Categoría creada", category };
  } catch (error) {
    console.error(error);
    return { error: "Error al crear categoría" };
  }
};
