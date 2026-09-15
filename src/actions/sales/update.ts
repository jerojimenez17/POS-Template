"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { pusherServer } from "@/lib/pusher-server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { z } from "zod";
import { Prisma } from "@prisma/client";
interface UpdateCaeInput {
  CAE: {
    CAE: string;
    vencimiento: string;
    nroComprobante: number | string;
    qrData: string;
    ptoVenta?: number | string;
  };
  IVACondition: string;
  documentType?: "" | "CUIT" | "DNI";
  documentNumber?: string | number;
  paidMethod: string;
  billType?: string;
}

export const updateOrderCaeAction = async (
  orderId: string,
  data: UpdateCaeInput
) => {
  const parsed = z.object({
    CAE: z.object({ CAE: z.string(), vencimiento: z.string(), nroComprobante: z.union([z.string(), z.number()]), qrData: z.string(), ptoVenta: z.union([z.string(), z.number()]).optional() }),
    IVACondition: z.string(),
    documentType: z.enum(["", "CUIT", "DNI"]).optional(),
    documentNumber: z.union([z.string(), z.number()]).optional(),
    paidMethod: z.string(),
    billType: z.string().optional(),
  }).safeParse(data);
  if (!parsed.success) return { error: "Datos de facturación inválidos" };
  const normalizedDocumentNumber = parsed.data.documentNumber === undefined || String(parsed.data.documentNumber).trim() === ""
    ? null : String(parsed.data.documentNumber);
  const documentRequired = parsed.data.IVACondition.trim().toLowerCase() !== "consumidor final" &&
    parsed.data.IVACondition.trim().toLowerCase() !== "consumidor_final";
  if (documentRequired && normalizedDocumentNumber === null) {
    return { error: "El número de documento es obligatorio para esta condición de IVA" };
  }
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  try {
    await db.order.update({
      where: { id: orderId, businessId },
      data: {
        CAE: parsed.data.CAE,
        clientIvaCondition: parsed.data.IVACondition,
        clientDocumentType: parsed.data.documentType || null,
        clientDocumentNumber: normalizedDocumentNumber,
        paymentMethod: parsed.data.paidMethod,
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { error: "Orden no encontrada" };
    }
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
            data: { amount: { increment: item.quantity }, last_update: new Date() },
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
