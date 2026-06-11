"use server";

import { auth } from "../../../auth";
import { salesRepository } from "@/repositories";
import type { SalesFilters } from "@/repositories";

/**
 * Returns paginated sales with stats and filtering
 * Uses DB aggregations for optimal performance
 */
export const getSalesFilteredAction = async (
  cursor?: string,
  limit: number = 10,
  startDate?: Date,
  endDate?: Date,
  seller?: string,
  _saleTypes?: string[],
  paymentMethods?: string[]
) => {
  const session = await auth();
  const businessId = session?.user?.businessId;

  if (!businessId) {
    return {
      sales: [],
      nextCursor: null,
      hasMore: false,
      totalCount: 0,
      stats: { totalSales: 0, totalToday: 0, todayCount: 0 },
    };
  }

  try {
    const filters: SalesFilters = {
      startDate,
      endDate,
      seller,
      paymentMethods,
    };

    const result = await salesRepository.getFilteredSales(
      businessId,
      cursor,
      limit,
      filters
    );

    return result;
  } catch (error) {
    console.error("Error fetching filtered sales:", error);
    return {
      sales: [],
      nextCursor: null,
      hasMore: false,
      totalCount: 0,
      stats: { totalSales: 0, totalToday: 0, todayCount: 0 },
    };
  }
};

/**
 * Delete an order and restore stock
 */
export const deleteOrderAction = async (orderId: string) => {
  const session = await auth();
  const businessId = session?.user?.businessId;

  if (!businessId) {
    return { error: "No autorizado" };
  }

  try {
    const { db } = await import("@/lib/db");
    const { pusherServer } = await import("@/lib/pusher-server");

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order || order.businessId !== businessId) {
      return { error: "Venta no encontrada" };
    }

    // Restore stock for each item
    for (const item of order.items) {
      if (!item.productId) continue;
      await db.product.update({
        where: { id: item.productId },
        data: {
          amount: { increment: item.quantity },
        },
      });
    }

    // Mark as cancelled (inpago removes from paid sales)
    await db.order.update({
      where: { id: orderId },
      data: { paidStatus: "inpago" },
    });

    // Notify via Pusher
    await pusherServer.trigger(`orders-${businessId}`, "orders-update", {
      orderId,
    });

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/searchBill");
    revalidatePath("/cashRegister");
    revalidatePath("/report");

    return { success: true };
  } catch (error) {
    console.error("Error deleting order:", error);
    return { error: "Error al eliminar la venta" };
  }
};