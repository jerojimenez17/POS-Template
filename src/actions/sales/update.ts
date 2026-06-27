"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { pusherServer } from "@/lib/pusher-server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

interface CaeData {
  CAE: string;
  vencimiento: string;
  nroComprobante: number;
  qrData: string;
}

interface UpdateCaeInput {
  CAE: CaeData;
  IVACondition: string;
  documentNumber: number;
  paidMethod: string;
  /** Persisted extra fields from the invoicing form */
  twoMethods?: boolean;
  secondPaidMethod?: string | null;
  totalSecondMethod?: number | null;
  discount?: number;
  billType?: string;
}

export const updateOrderCaeAction = async (
  orderId: string,
  data: UpdateCaeInput
) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  try {
    await db.$transaction(async (tx) => {
      // 1. Fetch current order to compute diffs
      const current = await tx.order.findUniqueOrThrow({
        where: { id: orderId, businessId },
      });

      // 2. Update the order with billing info
      await tx.order.update({
        where: { id: orderId, businessId },
        data: {
          CAE: data.CAE,
          clientIvaCondition: data.IVACondition,
          clientDocumentNumber: String(data.documentNumber),
          paymentMethod: data.paidMethod,
          // Extra fields
          ...(data.twoMethods !== undefined && {
            paymentMethod2: data.twoMethods ? data.secondPaidMethod ?? null : null,
            totalMethod2: data.twoMethods ? data.totalSecondMethod ?? 0 : 0,
          }),
          ...(data.discount !== undefined && {
            discountPercentage: data.discount,
          }),
        },
      });

      // 3. Record billType in OrderUpdate history (it's not on the Order model)
      if (data.billType) {
        const lastUpdate = await tx.orderUpdate.findFirst({
          where: { orderId },
          orderBy: { version: "desc" },
          select: { version: true },
        });

        await tx.orderUpdate.create({
          data: {
            orderId,
            businessId,
            updatedById: session!.user!.id,
            type: "ITEMS_UPDATED",
            message: "Facturación AFIP/ARCA",
            version: (lastUpdate?.version ?? 0) + 1,
            changes: {
              billTypeChanged: {
                from: null,
                to: data.billType,
              },
              ivaChanged: {
                from: { condition: current.clientIvaCondition, documentNumber: current.clientDocumentNumber },
                to: { condition: data.IVACondition, documentNumber: String(data.documentNumber) },
              },
              paymentChanged: {
                from: { method: current.paymentMethod, twoMethods: !!current.paymentMethod2, secondMethod: current.paymentMethod2 },
                to: { method: data.paidMethod, twoMethods: !!data.twoMethods, secondMethod: data.secondPaidMethod ?? null },
              },
              ...(data.discount !== undefined && {
                discountChanged: {
                  from: current.discountPercentage,
                  to: data.discount,
                },
              }),
              billTypeTo: data.billType,
            },
          },
        });
      }
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
