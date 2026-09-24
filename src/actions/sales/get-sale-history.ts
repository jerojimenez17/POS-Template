"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { OrderUpdateWithUser } from "./history";

export type { OrderUpdateWithUser } from "./history";

export async function getSaleHistoryAction(orderId: string): Promise<OrderUpdateWithUser[]> {
  if (typeof orderId !== "string" || orderId.trim().length === 0) {
    throw new Error("El ID de venta es inválido");
  }

  let businessId: string | null | undefined;
  try {
    const session = await auth();
    businessId = session?.user?.businessId;
  } catch (error) {
    console.error("Error authenticating sale history request:", error);
    throw new Error("No autorizado");
  }

  if (!businessId) {
    throw new Error("No autorizado");
  }

  try {
    return await db.orderUpdate.findMany({
      where: { orderId, order: { businessId } },
      include: {
        updatedBy: {
          select: { name: true, email: true },
        },
      },
      orderBy: { date: "desc" },
    });
  } catch (error) {
    console.error("Error fetching sale history:", error);
    throw new Error("No se pudo obtener el historial de la venta");
  }
}
