"use server";

import { db } from "@/lib/db";
import { auth } from "../../../auth";
import { revalidatePath } from "next/cache";
import type BillState from "@/models/BillState";
import { pusherServer } from "@/lib/pusher-server";
import CAE from "@/models/CAE";

/**
 * Returns paginated sales with stats and filtering
 */
export const getSalesFilteredAction = async (
  cursor?: string,
  limit: number = 10,
  startDate?: Date,
  endDate?: Date,
  seller?: string,
  _saleTypes?: string[],
  paymentMethods?: string[]
): Promise<{
  sales: BillState[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  stats: {
    totalSales: number;
    totalToday: number;
    todayCount: number;
  };
}> => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return {
    sales: [],
    nextCursor: null,
    hasMore: false,
    totalCount: 0,
    stats: { totalSales: 0, totalToday: 0, todayCount: 0 }
  };

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    // Build base where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseWhere: any = { businessId, paidStatus: "pago" };
    if (startDate) baseWhere.date = { gte: startDate };
    if (endDate) baseWhere.date = { ...baseWhere.date, lte: endDate };
    if (seller) baseWhere.seller = seller;
    if (paymentMethods && paymentMethods.length > 0) baseWhere.paymentMethod = { in: paymentMethods };

    // Count total
    const totalCount = await db.order.count({ where: baseWhere });

    // Fetch paginated orders
    const orders = await db.order.findMany({
      where: baseWhere,
      include: { items: true, client: true },
      orderBy: { date: "desc" },
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
    });

    const hasMore = orders.length > limit;
    const displayOrders = hasMore ? orders.slice(0, limit) : orders;
    const nextCursor = hasMore ? displayOrders[displayOrders.length - 1]?.id : null;

    // Parse to BillState
    const sales = displayOrders.map((order) => ({
      id: order.id,
      products: order.items.map((item) => ({
        id: item.productId || item.id,
        code: item.code || "",
        description: item.description || "",
        price: item.costPrice,
        salePrice: item.price,
        amount: item.quantity,
        unit: "unidades",
      })),
      total: order.total + order.discountAmount,
      totalWithDiscount: order.total,
      client: order.client?.name || undefined,
      clientId: order.clientId || undefined,
      seller: order.seller || "",
      discount: order.discountPercentage,
      date: order.date,
      typeDocument: order.clientIvaCondition || "DNI",
      documentNumber: order.clientDocumentNumber ? Number(order.clientDocumentNumber) : 0,
      secondPaidMethod: order.paymentMethod2 || undefined,
      totalSecondMethod: order.totalMethod2 || undefined,
      IVACondition: order.clientIvaCondition || "Consumidor Final",
      clientIvaCondition: order.clientIvaCondition || undefined,
      clientDocumentNumber: order.clientDocumentNumber || undefined,
      CAE: order.CAE as unknown as CAE | undefined,
      twoMethods: !!order.paymentMethod2 && order.totalMethod2 !== null && order.totalMethod2 > 0,
      paidMethod: order.paymentMethod || "Efetivo",
    })) as unknown as BillState[];

    // Get stats
    const allOrders = await db.order.findMany({
      where: baseWhere,
      select: { total: true, date: true },
    });

    const todayOrders = allOrders.filter(o => o.date >= todayStart);
    const totalSales = allOrders.reduce((acc, o) => acc + o.total, 0);
    const totalToday = todayOrders.reduce((acc, o) => acc + o.total, 0);
    const todayCount = todayOrders.length;

    return {
      sales,
      nextCursor,
      hasMore,
      totalCount,
      stats: { totalSales, totalToday, todayCount }
    };
  } catch (error) {
    console.error("Error fetching filtered sales:", error);
    return {
      sales: [],
      nextCursor: null,
      hasMore: false,
      totalCount: 0,
      stats: { totalSales: 0, totalToday: 0, todayCount: 0 }
    };
  }
};

/**
 * Delete an order and restore stock
 */
export const deleteOrderAction = async (orderId: string) => {
  const session = await auth();
  const businessId = session?.user?.businessId;

  if (!businessId) return { error: "No autorizado" };

  try {
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

    revalidatePath("/searchBill");
    revalidatePath("/cashRegister");
    revalidatePath("/report");

    return { success: true };
  } catch (error) {
    console.error("Error deleting order:", error);
    return { error: "Error al eliminar la venta" };
  }
};