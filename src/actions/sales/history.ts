"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import type BillState from "@/models/BillState";
import { pusherServer } from "@/lib/pusher-server";
import { StockActivityItem } from "@/components/StockActivityModal";
import { fail } from "@/lib/action-result";
import { PAGINATION } from "@/lib/pagination";
import { Prisma } from "@prisma/client";
import { parseCAE } from "@/lib/cae";

type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: true; client: true };
}>;

function mapOrderToBillState(order: OrderWithItems): BillState {
  return {
    id: order.id,
    products: order.items.map((item) => ({
      id: item.productId || item.id,
      code: item.code || "",
      description: item.description || "",
      price: item.costPrice,
      salePrice: item.price,
      amount: item.quantity,
      unit: "unidades",
      // Remaining fields to satisfy Product type
      brand: "",
      subCategory: "",
      gain: 0,
      suplier: { id: "", name: "", email: "", phone: "", discount: 0, iva: 0, gain: 0, creation_date: new Date() },
      client_bonus: 0,
      image: "",
      imageName: "",
      images: [],
      last_update: new Date(),
      creation_date: new Date(),
      category: "",
      catalog: true,
      details: "",
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
    CAE: parseCAE(order.CAE),
    twoMethods: !!order.paymentMethod2 && order.totalMethod2 !== null && order.totalMethod2 > 0,
    paidMethod: order.paymentMethod || "Efectivo",
  };
}

interface ReportOrder {
  total: number;
  discountAmount: number;
  paymentMethod: string | null;
  paymentMethod2: string | null;
  totalMethod2: number | null;
}

interface ReportReturn {
  total: number;
}

export const getDailyReportAction = async (startDate: Date, endDate?: Date) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = endDate ? new Date(endDate) : new Date(startDate);
  end.setHours(23, 59, 59, 999);

  try {
    const [orders, returns, stockMovements] = await Promise.all([
      db.order.findMany({
        where: { businessId, date: { gte: start, lte: end }, paidStatus: "pago" },
        include: { items: true },
      }),
      db.saleReturn.findMany({
        where: { businessId, date: { gte: start, lte: end } },
        include: { items: true },
      }),
      db.stockMovement.findMany({
        where: { businessId, date: { gte: start, lte: end } },
        include: { product: true },
      }),
    ]);

    const totalSales = orders.reduce((acc: number, o: ReportOrder) => acc + o.total, 0);
    const totalDiscounts = orders.reduce((acc: number, o: ReportOrder) => acc + o.discountAmount, 0);
    const totalReturns = returns.reduce((acc: number, r: ReportReturn) => acc + r.total, 0);
    
    const paymentMethods: Record<string, number> = {};
    orders.forEach((o: ReportOrder) => {
      if (o.paymentMethod) {
        const amount1 = o.total - (o.totalMethod2 || 0);
        paymentMethods[o.paymentMethod] = (paymentMethods[o.paymentMethod] || 0) + amount1;
      }
      if (o.paymentMethod2 && (o.totalMethod2 || 0) > 0) {
        paymentMethods[o.paymentMethod2] = (paymentMethods[o.paymentMethod2] || 0) + (o.totalMethod2 || 0);
      }
    });

    const outsMap = new Map<string, StockActivityItem>();
    const insMap = new Map<string, StockActivityItem>();

    stockMovements.forEach(sm => {
      if (sm.quantity === 0) return;
      const isOut = sm.quantity < 0;
      const absQty = Math.abs(sm.quantity);
      
      const targetMap = isOut ? outsMap : insMap;
      const existing = targetMap.get(sm.productId) || {
        productId: sm.productId,
        code: sm.product?.code || "",
        description: sm.product?.description || "Producto eliminado",
        quantity: 0
      };
      
      existing.quantity += absQty;
      targetMap.set(sm.productId, existing);
    });

    const outs = Array.from(outsMap.values()).sort((a, b) => b.quantity - a.quantity);
    const ins = Array.from(insMap.values()).sort((a, b) => b.quantity - a.quantity);

    return {
      success: true,
      data: {
        totalSales,
        totalDiscounts,
        totalReturns,
        netTotal: totalSales - totalReturns,
        orderCount: orders.length,
        returnCount: returns.length,
        paymentMethods,
        stockMovementCount: stockMovements.length,
        stockActivity: { outs, ins },
      }
    };
  } catch (error) {
    console.error("Error fetching daily report:", error);
    return fail("Error al generar el reporte");
  }
};

export const getSalesAction = async (params?: {
  cursor?: string;
  take?: number;
}): Promise<{ sales: BillState[]; nextCursor: string | null }> => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { sales: [], nextCursor: null };

  try {
    const take = params?.take ?? PAGINATION.SALES_MAX;
    const orders = await db.order.findMany({
      where: { businessId, paidStatus: "pago" },
      include: {
        items: true,
        client: true,
      },
      orderBy: { date: "desc" },
      take: take + 1,
      ...(params?.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });

    const hasMore = orders.length > take;
    const results = hasMore ? orders.slice(0, take) : orders;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    const parsedSales = results.map(mapOrderToBillState);

    return { sales: parsedSales, nextCursor };
  } catch (error) {
    console.error("Error fetching sales:", error);
    return { sales: [], nextCursor: null };
  }
};

export const getSaleByIdAction = async (id: string): Promise<BillState | null> => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return null;

  try {
    const order = await db.order.findUnique({
      where: { id, businessId },
      include: {
        items: true,
        client: true,
      },
    });

    if (!order) return null;

    return mapOrderToBillState(order);
  } catch (error) {
    console.error("Error fetching sale:", error);
    return null;
  }
};

export const getUniqueSellersAction = async (): Promise<string[]> => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return [];

  try {
    const sellers = await db.order.findMany({
      where: { 
        businessId,
        seller: { not: null, notIn: [""] }
      },
      select: {
        seller: true,
      },
      distinct: ['seller'],
    });

    return sellers.map(s => s.seller as string);
  } catch (error) {
    console.error("Error fetching unique sellers:", error);
    return [];
  }
};

export const getSaleHistoryAction = async (orderId: string) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return [];

  try {
    const updates = await db.orderUpdate.findMany({
      where: { orderId, order: { businessId } },
      include: {
        updatedBy: {
          select: { name: true, email: true }
        }
      },
      orderBy: { date: "desc" },
    });

    return updates;
  } catch (error) {
    console.error("Error fetching sale history:", error);
    return [];
  }
};

export type OrderUpdateWithUser = Prisma.OrderUpdateGetPayload<{
  include: {
    updatedBy: {
      select: {
        name: true;
        email: true;
      };
    };
  };
}>;
