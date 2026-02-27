"use server";

import { db } from "@/lib/db";
import { auth } from "../../../auth";
import { ProductSchema } from "@/schemas";
import { z } from "zod";
import { revalidatePath } from "next/cache";

export const newProduct = async (values: z.infer<typeof ProductSchema>) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const validateFields = ProductSchema.safeParse(values);
  if (!validateFields.success) {
    return { error: "Campos Invalidos" };
  }

  try {
    await db.product.create({
      data: {
        code: values.code,
        description: values.description,
        brandId: values.brand || undefined,
        categoryId: values.category || undefined,
        subCategoryId: values.subCategory || undefined,
        price: Number(values.price),
        salePrice: Number(values.price) * (1 + Number(values.gain) * 0.01),
        gain: Number(values.gain),
        amount: Number(values.amount),
        unit: values.unit,
        image: typeof values.image === "string" ? values.image : null,
        imageName: typeof values.imageName === "string" ? values.imageName : null,
        client_bonus: Number(values.client_bonus),
        supplierId: values.supplier || undefined,
        businessId: session.user.businessId,
      },
    });

    revalidatePath("/stock");
    return { success: "Producto cargado con éxito" };
  } catch (error) {
    console.error(error);
    return { error: "Error al crear producto en la base de datos" };
  }
};
