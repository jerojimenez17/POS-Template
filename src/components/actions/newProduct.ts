"use server";

import { db } from "@/lib/db";
import { auth } from "../../../auth";
import { ProductSchema } from "@/schemas";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertLimit } from "@/lib/auth-gates";
import { parsePlanError } from "@/lib/plan-error";
import { getDailyUsage, checkDailyLimit, incrementDailyUsage } from "@/lib/daily-limits";

type NewProductInput = z.infer<typeof ProductSchema> & {
  imageUrls?: string[];
};

export const newProduct = async (values: NewProductInput) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const currentCount = await db.product.count({ where: { businessId: session.user.businessId } });
  const limitCheck = await assertLimit("maxProducts", currentCount);
  if (!limitCheck.success) {
    const parsed = parsePlanError(limitCheck.error || "");
    return { error: limitCheck.error || "Has alcanzado el límite de productos de tu plan.", errorCode: parsed.isPlanError ? "LIMIT_EXCEEDED" : undefined };
  }

  // Daily limit check for DEMO plan
  const usage = await getDailyUsage(session.user.businessId);
  const dailyLimitCheck = await checkDailyLimit(session.user.businessId, "dailyProductsLimit", usage.productsCreated);
  if (!dailyLimitCheck.allowed) {
    return { error: `Has superado el límite diario de creación de productos (${dailyLimitCheck.limit}).` };
  }

  const validateFields = ProductSchema.safeParse(values);
  if (!validateFields.success) {
    return { error: "Campos Invalidos" };
  }

  try {
    let finalCode = values.code;
    if (values.supplier && values.code) {
      const supplier = await db.supplier.findUnique({ where: { id: values.supplier } });
      if (supplier) {
        const prefix = supplier.name.toLowerCase().replace(/\s+/g, '').slice(0, 3);
        if (!finalCode.startsWith(`${prefix}-`)) {
          finalCode = `${prefix}-${finalCode}`;
        }
      }
    }

    const product = await db.product.create({
      data: {
        code: finalCode,
        codebar: values.codebar || null,
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

    if (values.imageUrls && values.imageUrls.length > 0) {
      await db.productImage.createMany({
        data: values.imageUrls.map((url) => ({ productId: product.id, url })),
      });
    }

    await incrementDailyUsage(session.user.businessId, "productsCreated");
    revalidatePath("/stock");
    return { success: "Producto cargado con éxito" };
  } catch (error) {
    console.error(error);
    return { error: "Error al crear producto en la base de datos" };
  }
};
