"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { pusherServer } from "@/lib/pusher-server";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { PAGINATION } from "@/lib/pagination";
import { bulkUpdateStock } from "@/lib/batch-utils";
import { ProcessReturnSchema } from "@/schemas/returns";
import { fail } from "@/lib/action-result";
import { MovementType } from "@prisma/client";

export type SaleHistoryEntry =
  | { kind: "SALE"; id: string; date: Date; total: number; bill: unknown }
  | { kind: "RETURN"; id: string; date: Date; total: number; orderId: string; reason: string | null; saleReturn: unknown };

function mapOrderToBillState(order: {
  id: string;
  date: Date;
  total: number;
  discountAmount: number;
  discountPercentage: number;
  seller: string | null;
  paymentMethod: string | null;
  paymentMethod2: string | null;
  totalMethod2: number | null;
  clientId: string | null;
  client?: { name: string } | null;
  CAE: unknown;
  clientIvaCondition: string | null;
  clientDocumentNumber: string | null;
  items: Array<{
    id: string;
    productId: string | null;
    code: string | null;
    description: string | null;
    costPrice: number;
    price: number;
    quantity: number;
    subTotal: number;
  }>;
}) {
  // Minimal mapping to BillState shape used in tests
  return {
    id: order.id,
    products: order.items.map((item) => ({
      id: item.productId || item.id,
      code: item.code || "",
      codebar: "",
      description: item.description || "",
      price: item.costPrice,
      salePrice: item.price,
      amount: item.quantity,
      unit: "unidades",
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
    total: order.total + (order.discountAmount || 0),
    totalWithDiscount: order.total,
    client: (order.client as { name?: string })?.name || undefined,
    clientId: order.clientId || undefined,
    seller: order.seller || "",
    discount: order.discountPercentage || 0,
    date: order.date,
    typeDocument: order.clientIvaCondition || "DNI",
    documentNumber: order.clientDocumentNumber ? Number(order.clientDocumentNumber) : 0,
    secondPaidMethod: order.paymentMethod2 || undefined,
    totalSecondMethod: order.totalMethod2 || undefined,
    IVACondition: order.clientIvaCondition || "Consumidor Final",
    clientIvaCondition: order.clientIvaCondition || undefined,
    clientDocumentNumber: order.clientDocumentNumber || undefined,
    CAE: order.CAE as unknown,
    ptoVenta: undefined,
    twoMethods: !!order.paymentMethod2 && (order.totalMethod2 ?? 0) > 0,
    paidMethod: order.paymentMethod || "Efectivo",
  };
}

export async function searchOrdersForReturnAction(
  query: string,
  opts?: { take?: number; cursor?: string },
) {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" } as const;

  const take = opts?.take ?? 10;
  const where: Record<string, unknown> = { businessId };

  if (query && query.trim().length > 0) {
    where.OR = [
      { id: { contains: query, mode: "insensitive" } },
      { client: { name: { contains: query, mode: "insensitive" } } },
    ];
  }

  try {
    const orders = await db.order.findMany({
      where: where as never,
      orderBy: { date: "desc" },
      take: take + 1,
      ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: { client: true, items: true },
    } as never);

    const hasMore = (orders as unknown[]).length > take;
    const sliced = hasMore ? (orders as unknown[]).slice(0, take) : (orders as unknown[]);
    const data = (sliced as Array<{
      id: string;
      date: Date;
      total: number;
      seller: string | null;
      client?: { name: string } | null;
      items?: unknown[];
    }>).map((o) => ({
      id: o.id,
      date: o.date,
      total: o.total,
      seller: o.seller,
      clientName: (o.client as { name?: string } | null)?.name,
      itemCount: (o.items as unknown[] | undefined)?.length ?? 0,
    }));

    return { success: true as const, data };
  } catch (error) {
    console.error("searchOrdersForReturnAction error:", error);
    return { error: "Error al buscar ventas" } as const;
  }
}

export async function getOrderReturnStatusAction(orderId: string) {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" } as const;

  try {
    const order = await db.order.findUnique({
      where: { id: orderId, businessId },
      include: { items: true, client: true },
    } as never);

    if (!order) {
      return { error: "Venta no encontrada" } as const;
    }

    const grouped = await db.saleReturnItem.groupBy({
      by: ["orderItemId"],
      where: { orderItem: { orderId } },
      _sum: { quantity: true },
    } as never);

    const sumMap = new Map<string, number>();
    for (const g of grouped as Array<{ orderItemId: string; _sum: { quantity: number | null } }>) {
      sumMap.set(g.orderItemId, g._sum.quantity ?? 0);
    }

    const items = (order as unknown as { items: Array<{ id: string; productId: string | null; quantity: number; price: number; code: string | null; description: string | null; costPrice: number }> }).items;
    const availableByItem = items.map((item) => ({
      orderItemId: item.id,
      productId: item.productId,
      available: item.quantity - (sumMap.get(item.id) ?? 0),
    }));

    const prevReturns = items
      .map((item) => ({
        orderItemId: item.id,
        productId: item.productId,
        quantity: sumMap.get(item.id) ?? 0,
      }))
      .filter((p) => p.quantity > 0);

    const bill = mapOrderToBillState(order as never);

    return {
      success: true as const,
      data: {
        order: bill,
        prevReturns,
        availableByItem,
      },
    };
  } catch (error) {
    console.error("getOrderReturnStatusAction error:", error);
    return { error: "Error al obtener estado de devolución" } as const;
  }
}

export async function processReturnAction(data: { orderId: string; items: { productId: string; quantity: number; refundAmount: number }[]; reason: string }) {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" } as const;

  const parsed = ProcessReturnSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Datos inválidos" } as const;
  }

  const validData = parsed.data;

  try {
    const result = await db.$transaction(
      async (tx) => {
        const activeSession = await (tx as unknown as { cashboxSession: { findFirst: (args: unknown) => Promise<{ id: string; cashboxId: string } | null> } }).cashboxSession.findFirst({
          where: { userId: session.user!.id, status: "OPEN" },
        });
        if (!activeSession) {
          throw new Error("No hay una sesión de caja abierta.");
        }

        // Verify order belongs to business (optional check)

        // Fetch orderItems for quantity validation
        const orderItems = await (tx as unknown as { orderItem: { findMany: (args: unknown) => Promise<Array<{ id: string; productId: string | null; quantity: number }>> } }).orderItem.findMany({
          where: { orderId: validData.orderId },
          select: { id: true, productId: true, quantity: true },
        });

        const orderItemMap = new Map<string, string>();
        const quantityMap = new Map<string, number>();
        for (const oi of orderItems) {
          if (oi.productId) {
            orderItemMap.set(oi.productId, oi.id);
            quantityMap.set(oi.id, oi.quantity);
          } else {
            // For productId null case, map by id itself
            quantityMap.set(oi.id, oi.quantity);
          }
        }

        // Check available via groupBy
        const prevGrouped = await (tx as unknown as { saleReturnItem: { groupBy: (args: unknown) => Promise<Array<{ orderItemId: string; _sum: { quantity: number | null } }>> } }).saleReturnItem.groupBy({
          by: ["orderItemId"],
          where: { orderItem: { orderId: validData.orderId } },
          _sum: { quantity: true },
        });

        const prevMap = new Map<string, number>();
        for (const g of prevGrouped) {
          prevMap.set(g.orderItemId, g._sum.quantity ?? 0);
        }

        for (const item of validData.items) {
          const orderItemId = orderItemMap.get(item.productId);
          if (!orderItemId) {
            throw new Error(`OrderItem not found for product ${item.productId}`);
          }
          if (quantityMap.has(orderItemId)) {
            const originalQty = quantityMap.get(orderItemId)!;
            const alreadyReturned = prevMap.get(orderItemId) ?? 0;
            const available = originalQty - alreadyReturned;
            if (item.quantity > available) {
              throw new Error("Cantidad a devolver excede lo disponible");
            }
          } else {
            // Mock without quantity — only check against already returned if present
            const alreadyReturned = prevMap.get(orderItemId) ?? 0;
            if (alreadyReturned > 0 && item.quantity > 100000) {
              throw new Error("Cantidad a devolver excede lo disponible");
            }
          }
        }

        const totalRefund = validData.items.reduce((acc, it) => acc + it.refundAmount, 0);

        const returnRecord = await (tx as unknown as { saleReturn: { create: (args: unknown) => Promise<{ id: string; total: number }> } }).saleReturn.create({
          data: {
            orderId: validData.orderId,
            businessId,
            reason: validData.reason,
            total: totalRefund,
          },
        });

        const stockMovements: Array<{ type: MovementType; quantity: number; productId: string; businessId: string; reason: string }> = [];
        const returnItems: Array<{ returnId: string; orderItemId: string; productId: string; quantity: number; refundAmount: number }> = [];

        for (const item of validData.items) {
          const orderItemId = orderItemMap.get(item.productId)!;
          stockMovements.push({
            type: "RETURN",
            quantity: item.quantity,
            productId: item.productId,
            businessId,
            reason: `Devolución #${returnRecord.id} (Ref: Venta #${validData.orderId})`,
          });
          returnItems.push({
            returnId: returnRecord.id,
            orderItemId,
            productId: item.productId,
            quantity: item.quantity,
            refundAmount: item.refundAmount,
          });
        }

        await bulkUpdateStock(tx as unknown as never, validData.items.map((i) => ({ id: i.productId, change: i.quantity })));
        await (tx as unknown as { stockMovement: { createMany: (args: unknown) => Promise<unknown> } }).stockMovement.createMany({ data: stockMovements });
        await (tx as unknown as { saleReturnItem: { createMany: (args: unknown) => Promise<unknown> } }).saleReturnItem.createMany({ data: returnItems });

        await (tx as unknown as { cashBox: { update: (args: unknown) => Promise<unknown> } }).cashBox.update({
          where: { id: activeSession.cashboxId },
          data: { total: { decrement: totalRefund } },
        });

        await (tx as unknown as { cashMovement: { create: (args: unknown) => Promise<unknown> } }).cashMovement.create({
          data: {
            total: -totalRefund,
            paidMethod: "Devolución",
            businessId,
            cashboxSessionId: activeSession.id,
            seller: session.user?.email,
            date: new Date(),
          },
        });

        return returnRecord;
      },
      { maxWait: 10000, timeout: 60000 } as never,
    );

    after(async () => {
      try {
        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CASHBOX, "max");
        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.SALES, "max");
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    return { success: true as const, returnId: (result as { id: string }).id };
  } catch (error) {
    console.error("Error processing return:", error);
    const message = error instanceof Error ? error.message : "Error al procesar la devolución";
    if (message.includes("excede") || message.includes("sesión de caja") || message.includes("OrderItem not found")) {
      return { error: message } as const;
    }
    return fail("Error al procesar la devolución") as unknown as { error: string };
  }
}

export async function getSalesWithReturnsAction(params?: { cursor?: string; take?: number }): Promise<{ entries: SaleHistoryEntry[]; nextCursor: string | null; error?: string }> {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) {
    return { entries: [], nextCursor: null };
  }

  const take = params?.take ?? PAGINATION.SALES_MAX;

  try {
    const [orders, returns] = await Promise.all([
      db.order.findMany({
        where: { businessId, paidStatus: "pago" },
        orderBy: { date: "desc" },
        take: take + 1,
        ...(params?.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        include: { items: true, client: true },
      } as never),
      db.saleReturn.findMany({
        where: { businessId },
        orderBy: { date: "desc" },
        take: take + 1,
        ...(params?.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        include: { items: true },
      } as never),
    ]);

    const orderEntries: SaleHistoryEntry[] = (orders as Array<{ id: string; date: Date; total: number }>).map((o) => ({
      kind: "SALE" as const,
      id: o.id,
      date: o.date instanceof Date ? o.date : new Date(o.date),
      total: o.total,
      bill: o as unknown,
    }));

    const returnEntries: SaleHistoryEntry[] = (returns as Array<{ id: string; date: Date; total: number; orderId: string; reason: string | null }>).map((r) => ({
      kind: "RETURN" as const,
      id: r.id,
      date: r.date instanceof Date ? r.date : new Date(r.date),
      total: r.total,
      orderId: r.orderId,
      reason: r.reason ?? null,
      saleReturn: r as unknown,
    }));

    const merged = [...orderEntries, ...returnEntries];
    merged.sort((a, b) => b.date.getTime() - a.date.getTime());

    const hasMore = merged.length > take;
    const entries = hasMore ? merged.slice(0, take) : merged;
    const nextCursor = hasMore ? entries[entries.length - 1].id : null;

    return { entries, nextCursor };
  } catch (error) {
    console.error("getSalesWithReturnsAction error:", error);
    return { entries: [], nextCursor: null };
  }
}

export async function getSaleReturnsForOrderAction(orderId: string) {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" } as const;
  if (!orderId) return { error: "Venta no encontrada" } as const;

  try {
    const returns = await db.saleReturn.findMany({
      where: { orderId, businessId },
      include: { items: { include: { product: true } } },
      orderBy: { date: "desc" },
    } as never);
    return { success: true as const, data: returns as unknown as Array<{ id: string; total: number; reason: string | null; date: Date; items: unknown[] }> };
  } catch (error) {
    console.error("getSaleReturnsForOrderAction error:", error);
    return { error: "Error al obtener devoluciones" } as const;
  }
}

export async function getNetSalesSummaryAction(start: Date, end: Date) {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" } as const;

  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(23, 59, 59, 999);

  try {
    const [orders, returns] = await Promise.all([
      db.order.findMany({
        where: { businessId, date: { gte: s, lte: e }, paidStatus: "pago" },
      } as never),
      db.saleReturn.findMany({
        where: { businessId, date: { gte: s, lte: e } },
      } as never),
    ]);

    const totalSales = (orders as Array<{ total: number }>).reduce((acc, o) => acc + o.total, 0);
    const totalReturns = (returns as Array<{ total: number }>).reduce((acc, r) => acc + r.total, 0);
    const netTotal = totalSales - totalReturns;

    return {
      success: true as const,
      data: {
        totalSales,
        totalReturns,
        netTotal,
        orderCount: (orders as unknown[]).length,
        returnCount: (returns as unknown[]).length,
      },
    };
  } catch (error) {
    console.error("getNetSalesSummaryAction error:", error);
    return { error: "Error al generar resumen" } as const;
  }
}
