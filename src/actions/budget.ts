"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { pusherServer } from "@/lib/pusher-server";
import { fail } from "@/lib/action-result";
import { requireFeature } from "@/lib/auth-gates";

interface BudgetProduct {
  id: string;
  code: string;
  description: string;
  price?: number;
  salePrice?: number;
  amount: number;
}

interface BudgetInput {
  total: number;
  totalWithDiscount?: number;
  seller: string;
  discount?: number;
  paidMethod?: string;
  clientId?: string;
  clientIvaCondition?: string;
  clientDocumentNumber?: string;
  products: BudgetProduct[];
}

export const createBudgetAction = async (input: BudgetInput) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  const featureCheck = await requireFeature("hasBudget");
  if (!featureCheck.success) {
    return { error: featureCheck.error || "Esta funcionalidad no está disponible en tu plan actual." };
  }

  try {
    const discountPercent = Number(input.discount) || 0;
    const total = input.totalWithDiscount || input.total;
    const discountAmount = input.total * discountPercent * 0.01;

    const order = await db.order.create({
      data: {
        total: total,
        seller: input.seller,
        status: "pendiente",
        paidStatus: "inpago",
        paymentMethod: input.paidMethod || "Efectivo",
        discountPercentage: discountPercent,
        discountAmount: discountAmount,
        businessId: businessId,
        clientId: input.clientId || null,
        clientIvaCondition: input.clientIvaCondition,
        clientDocumentNumber: input.clientDocumentNumber,
        items: {
          create: input.products.map((p) => ({
            productId: p.id,
            code: p.code,
            description: p.description,
            costPrice: p.price || 0,
            price: p.salePrice || p.price || 0,
            quantity: p.amount,
            subTotal: (p.salePrice || p.price || 0) * p.amount,
          })),
        },
      },
      include: { items: true },
    });

    await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.SALES, "max");

    return { success: true, orderId: order.id };
  } catch (error) {
    console.error("Error creating budget:", error);
    return fail("Error al crear el presupuesto");
  }
};
