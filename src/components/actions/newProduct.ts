"use server";

import { db } from "@/lib/db";
import { auth } from "../../../auth";
import { ProductSchema } from "@/schemas";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/firebase/config";
import { v4 } from "uuid";

type NewProductInput = z.infer<typeof ProductSchema> & {
  newImages?: File[];
};

export const newProduct = async (values: NewProductInput) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const validateFields = ProductSchema.safeParse(values);
  if (!validateFields.success) {
    return { error: "Campos Invalidos" };
  }

  try {
    const product = await db.product.create({
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

    if (values.newImages && values.newImages.length > 0) {
      const imageRows: { productId: string; url: string }[] = [];
      for (const file of values.newImages) {
        const imageName = `${file.name}_${v4()}`;
        const storageRef = ref(storage, `/productImage/${imageName}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        imageRows.push({ productId: product.id, url });
      }
      await db.productImage.createMany({ data: imageRows });
    }

    revalidatePath("/stock");
    return { success: "Producto cargado con éxito" };
  } catch (error) {
    console.error(error);
    return { error: "Error al crear producto en la base de datos" };
  }
};
