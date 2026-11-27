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

  const data = validateFields.data;

  try {
    let finalCode = data.code;
    if (data.supplier && data.code) {
      const supplier = await db.supplier.findUnique({ where: { id: data.supplier } });
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
        codebar: data.codebar || null,
        description: data.description,
        brandId: data.brand || undefined,
        categoryId: data.category || undefined,
        subCategoryId: data.subCategory || undefined,
        price: data.price,
        salePrice: data.price * (1 + data.gain * 0.01),
        gain: data.gain,
        amount: data.amount,
        unit: data.unit,
        image: typeof data.image === "string" ? data.image : null,
        imageName: typeof data.imageName === "string" ? data.imageName : null,
        client_bonus: data.client_bonus,
        supplierId: data.supplier || undefined,
        catalog: data.catalog !== undefined ? data.catalog : true,
        details: data.details || null,
        businessId: session.user.businessId,
      },
    });

    if (values.imageUrls && values.imageUrls.length > 0) {
      await db.productImage.createMany({
        data: values.imageUrls.map((url) => ({ productId: product.id, url })),
      });

      // Sync legacy image field with first URL for backward compatibility
      if (!data.image && values.imageUrls[0]) {
        await db.product.update({
          where: { id: product.id },
          data: { image: values.imageUrls[0] },
        });
      }
    }

    await incrementDailyUsage(session.user.businessId, "productsCreated");
    revalidatePath("/stock");
    return { success: "Producto cargado con éxito" };
  } catch (error) {
    console.error(error);
    return { error: "Error al crear producto en la base de datos" };
  }
};
