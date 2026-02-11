"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidatePath } from "next/cache";

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
    revalidatePath("/stock");
    return { success: "Marca creada", brand };
  } catch (error) {
    console.error(error);
    return { error: "Error al crear marca" };
  }
};
