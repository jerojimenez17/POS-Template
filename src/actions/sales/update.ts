"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { pusherServer } from "@/lib/pusher-server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
interface UpdateCaeInput {
  CAE: {
    CAE: string;
    vencimiento: string;
    nroComprobante: number;
    qrData: string;
  };
  IVACondition: string;
  documentNumber: number;
  paidMethod: string;
}

export const updateOrderCaeAction = async (
  orderId: string,
  data: UpdateCaeInput
) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  try {
    await db.order.update({
      where: { id: orderId, businessId },
      data: {
        CAE: data.CAE,
        clientIvaCondition: data.IVACondition,
        clientDocumentNumber: String(data.documentNumber),
        paymentMethod: data.paidMethod,
      },
    });

    await pusherServer.trigger(
      `orders-${businessId}`,
      "orders-update",
      {}
    );

    revalidateTag(CACHE_TAGS.SALES, "max");
    revalidateTag(CACHE_TAGS.ORDERS, "max");
    return { success: true };
  } catch (error) {
    console.error("Error updating sale CAE:", error);
    return { error: "Error al actualizar CAE de la venta" };
  }
};

export const deleteOrderAction = async (orderId: string) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  try {
    const order = await db.order.findFirst({
      where: { id: orderId, businessId },
      include: { items: true },
    });

    if (!order) return { error: "Orden no encontrada" };

    await db.$transaction(async (tx) => {
      // Restore stock for each item
      for (const item of order.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { amount: { increment: item.quantity } },
          });
        }
      }

      // Delete the order (cascades to items, movements, etc.)
      await tx.order.delete({
        where: { id: orderId },
      });
    });

    await pusherServer.trigger(
      `orders-${businessId}`,
      "orders-update",
      {}
    );

    revalidateTag(CACHE_TAGS.SALES, "max");
    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.STOCK, "max");
    revalidateTag(CACHE_TAGS.CASHBOX, "max");
    return { success: true };
  } catch (error) {
    console.error("Error deleting sale:", error);
    return { error: "Error al eliminar la venta" };
  }
};
