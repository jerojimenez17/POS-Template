"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { MovementType, PaidStatus } from "@prisma/client";
import { z } from "zod";
import { pusherServer } from "@/lib/pusher-server";
import { requireFeature } from "@/lib/auth-gates";
import { processInBatches, bulkUpdateStock } from "@/lib/batch-utils";

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface UnpaidOrderItem {
  productId: string;
  code?: string;
  description?: string;
  costPrice?: number;
  price: number;
  quantity: number;
  subTotal: number;
}

interface CreateUnpaidOrderInput {
  clientId: string;
  businessId: string;
  items: UnpaidOrderItem[];
  total: number;
  clientIvaCondition?: string;
  clientDocumentNumber?: string;
}

interface RegisterPaymentInput {
  orderId: string;
  amount: number;
  paymentMethod: string;
  businessId: string;
}

interface CancelUnpaidOrderInput {
  orderId: string;
  businessId: string;
}

interface GetUnpaidOrdersInput {
  businessId: string;
  status?: string;
  orderId?: string;
}

const addItemsToOrderSchema = z.object({
  orderId: z.string(),
  businessId: z.string(),
  items: z.array(
    z.object({
      productId: z.string(),
      code: z.string().optional(),
      description: z.string().optional(),
      costPrice: z.number().optional(),
      price: z.number(),
      quantity: z.number(),
      subTotal: z.number(),
    })
  ),
});

const updateOrderItemSchema = z.object({
  itemId: z.string(),
  orderId: z.string(),
  quantity: z.number().min(0.01).optional(),
  price: z.number().min(0).optional(),
});

const removeOrderItemSchema = z.object({
  itemId: z.string(),
  orderId: z.string(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getClientUnpaidOrderSchema = z.object({
  clientId: z.string(),
  businessId: z.string(),
});

export const createUnpaidOrder = async (input: CreateUnpaidOrderInput): Promise<ActionResult> => {
  try {
    const featureResult = await requireFeature("hasClientLedger");
    if (!featureResult.success) return { success: false, error: featureResult.error };
    const session = await auth();
    const businessId = session?.user?.businessId || input.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };
    const allowNegativeStock = (session?.user?.business?.features as Record<string, unknown>)?.hasNegativeStock === true;

    // Hoist ranking data so after() can access it
    let rankingItems: { productId: string; quantity: number; price: number }[] = [];

    const result = await db.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: input.clientId },
      });
      if (!client) throw new Error("Cliente no encontrado");

      const productIds = input.items.map(i => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, amount: true },
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      for (const item of input.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error(`Producto ${item.description || item.productId} no encontrado`);
        }
        if (!allowNegativeStock && product.amount < item.quantity) {
          throw new Error(`Stock insuficiente para ${item.description || item.productId}`);
        }
      }

      const order = await tx.order.create({
        data: {
          clientId: input.clientId,
          businessId,
          total: input.total,
          status: "confirmado",
          paidStatus: "inpago",
          date: new Date(),
          clientIvaCondition: input.clientIvaCondition,
          clientDocumentNumber: input.clientDocumentNumber,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              code: item.code,
              description: item.description,
              costPrice: item.costPrice || 0,
              price: item.price,
              quantity: item.quantity,
              subTotal: item.subTotal,
              addedAt: new Date(),
            })),
          },
        },
      });

      // 🚀 FASE 1+2: Bulk UPDATE (raw SQL) + stockMovement.createMany
      // Ranking upsert → after() (analítica, eventual consistency)
      const stockMovements: { type: MovementType; quantity: number; productId: string; orderId: string; businessId: string }[] = [];
      for (const item of input.items) {
        stockMovements.push({
          type: "SALE",
          quantity: -item.quantity,
          productId: item.productId,
          orderId: order.id,
          businessId,
        });
        rankingItems.push({ productId: item.productId, quantity: item.quantity, price: item.price });
      }

      await bulkUpdateStock(tx, input.items.map(i => ({ id: i.productId, change: -i.quantity })));
      await tx.stockMovement.createMany({ data: stockMovements });

      await tx.client.update({
        where: { id: input.clientId },
        data: { balance: { increment: input.total } },
      });

      return { success: true, data: order };
    }, {
      maxWait: 10000,
      timeout: 60000,
    });

    // ⏰ Respuesta inmediata — ranking + cache en background
    after(async () => {
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        await db.$transaction(async (tx) => {
          await processInBatches(rankingItems, 15, (item: { productId: string; quantity: number; price: number }) => [
            tx.productRanking.upsert({
              where: {
                productId_month_year_businessId: {
                  productId: item.productId,
                  month, year, businessId,
                },
              },
              update: {
                totalSold: { increment: item.quantity },
                totalIncome: { increment: item.quantity * item.price },
              },
              create: {
                productId: item.productId,
                month, year, businessId,
                totalSold: item.quantity,
                totalIncome: item.quantity * item.price,
              },
            }),
          ]);
        });

        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    return result;
  } catch (error) {
    console.error("Error creating unpaid order:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al crear la orden",
    };
  }
};

export const registerPayment = async (input: RegisterPaymentInput): Promise<ActionResult> => {
  try {
    const session = await auth();
    const businessId = session?.user?.businessId || input.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };

    const movement = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { client: true, cashMovements: true },
      });
      if (!order) throw new Error("Orden no encontrada");

      const totalPaidBefore = order.cashMovements.reduce(
        (sum, cm) => sum + cm.total,
        0
      );
      const remainingBalance = order.total - (totalPaidBefore + input.amount);

      if (input.amount > order.total - totalPaidBefore) {
        throw new Error("El pago no puede exceder el saldo remaining");
      }

      const cashMovementData = {
        total: input.amount,
        paidMethod: input.paymentMethod,
        businessId,
        date: new Date(),
        orderId: input.orderId,
      };
      const newMovement = await tx.cashMovement.create({ data: cashMovementData } as never);

      if (order.clientId) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { decrement: input.amount } },
        });
      }

      const newPaidStatus: PaidStatus =
        remainingBalance <= 0 ? "pago" : "inpago";
      await tx.order.update({
        where: { id: input.orderId },
        data: { paidStatus: newPaidStatus },
      });

      return newMovement;
    });

    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.CLIENTS, "max");
    revalidateTag(CACHE_TAGS.CASHBOX, "max");
    revalidateTag(CACHE_TAGS.ORDERS, "max");
    await pusherServer.trigger(`movements-${businessId}`, "new-movement", movement);

    return { success: true };
  } catch (error) {
    console.error("Error registering payment:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al registrar el pago",
    };
  }
};

export const cancelUnpaidOrder = async (input: CancelUnpaidOrderInput): Promise<ActionResult> => {
  try {
    const session = await auth();
    const businessId = session?.user?.businessId || input.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };

    // Hoist ranking data for after()
    let rankingItems: { productId: string; quantity: number; price: number }[] = [];

    const result = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { client: true, items: { include: { product: true } } },
      });
      if (!order) throw new Error("Orden no encontrada");

      if (order.paidStatus === "pago") {
        throw new Error("No se puede cancelar una orden ya pagado");
      }

      // 🚀 FASE 2: Bulk UPDATE en vez de for...of con updates individuales
      const stockChanges: { id: string; change: number }[] = [];
      for (const item of order.items) {
        if (item.productId) {
          stockChanges.push({ id: item.productId, change: item.quantity });
          rankingItems.push({ productId: item.productId, quantity: -item.quantity, price: item.price });
        }
      }
      await bulkUpdateStock(tx, stockChanges);

      if (order.clientId) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { decrement: order.total } },
        });
      }

      // Delete related records before deleting the order
      await tx.stockMovement.deleteMany({ where: { orderId: input.orderId } });
      await tx.cashMovement.deleteMany({ where: { orderId: input.orderId } });

      // Delete the order (cascades to OrderItem and OrderUpdate)
      await tx.order.delete({ where: { id: input.orderId } });

      return { success: true };
    });

    // ⏰ Respuesta inmediata — ranking + cache en background
    after(async () => {
      try {
        if (rankingItems.length > 0) {
          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();

          await db.$transaction(async (tx) => {
            await processInBatches(rankingItems, 15, (item: { productId: string; quantity: number; price: number }) => [
              tx.productRanking.upsert({
                where: {
                  productId_month_year_businessId: {
                    productId: item.productId, month, year, businessId,
                  },
                },
                update: {
                  totalSold: { increment: item.quantity },
                  totalIncome: { increment: item.quantity * item.price },
                },
                create: {
                  productId: item.productId, month, year, businessId,
                  totalSold: 0,
                  totalIncome: 0,
                },
              }),
            ]);
          });
        }

        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    return result;
  } catch (error) {
    console.error("Error canceling unpaid order:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al cancelar la orden",
    };
  }
};

export const getUnpaidOrders = async (input: GetUnpaidOrdersInput): Promise<ActionResult> => {
  try {
    const session = await auth();
    const businessId = session?.user?.businessId || input.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };

    let orders;
    if (input.orderId) {
      orders = await db.order.findUnique({
        where: { id: input.orderId, businessId },
        include: {
          client: true,
          cashMovements: true,
        },
      } as never);
      orders = orders ? [orders] : [];
    } else if (input.status === "all") {
      orders = await db.order.findMany({
        where: { businessId },
        include: { client: true },
        orderBy: { date: "desc" },
      });
    } else {
      const isPending = input.status === "pendiente";
      const paidStatus = (input.status === "pagado" ? "pago" : input.status) as PaidStatus | undefined;
      orders = await db.order.findMany({
        where: {
          businessId,
          ...(isPending ? { status: "pendiente" } : { status: { not: "pendiente" } }),
          ...(!isPending && paidStatus ? { paidStatus } : {}),
        },
        include: { client: true },
        orderBy: { date: "desc" },
      });
    }

    return { success: true, data: orders };
  } catch (error) {
    console.error("Error getting unpaid orders:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al obtener las órdenes",
    };
  }
};

export const getClientUnpaidOrders = async (clientId: string, businessId: string): Promise<ActionResult<{ id: string; total: number; date: Date; itemsCount: number; status: string; paidStatus: string }[]>> => {
  try {
    const session = await auth();
    const businessIdFinal = session?.user?.businessId || businessId;
    if (!businessIdFinal) return { success: false, error: "No autorizado" };

    const orders = await db.order.findMany({
      where: {
        clientId,
        businessId: businessIdFinal,
        paidStatus: "inpago",
        status: { in: ["pendiente", "confirmado", "consignacion"] },
      },
      include: {
        _count: { select: { items: true } },
      },
      orderBy: { date: "desc" },
    });

    return {
      success: true,
      data: orders.map(o => ({
        id: o.id,
        total: o.total,
        date: o.date,
        itemsCount: o._count.items,
        status: o.status,
        paidStatus: o.paidStatus,
      })),
    };
  } catch (error) {
    console.error("Error getting client unpaid orders:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al obtener las órdenes",
    };
  }
};

export const addItemsToOrder = async (input: z.infer<typeof addItemsToOrderSchema>): Promise<ActionResult> => {
  try {
    const validatedInput = addItemsToOrderSchema.parse(input);
    const session = await auth();
    const businessId = session?.user?.businessId || validatedInput.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };
    const allowNegativeStock = (session?.user?.business?.features as Record<string, unknown>)?.hasNegativeStock === true;

    // Hoist ranking data for after()
    let rankingItems: { productId: string; quantity: number; price: number }[] = [];

    const result = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: validatedInput.orderId },
        include: { client: true, items: true },
      });

      if (!order) throw new Error("Orden no encontrada");
      if (order.paidStatus === "pago") throw new Error("No se puede modificar una orden pagado");

      const products = await tx.product.findMany({
        where: { id: { in: validatedInput.items.map(i => i.productId) } },
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      for (const item of validatedInput.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error(`Producto ${item.description || item.productId} no encontrado`);
        }
        if (!allowNegativeStock && product.amount < item.quantity) {
          throw new Error(`Stock insuficiente para ${item.description || item.productId}`);
        }
      }

      // 🚀 FASE 1+2: Bulk UPDATE + createMany (orderItems + stockMovements)
      // Ranking → after()
      const stockMovements: { type: MovementType; quantity: number; productId: string; orderId: string; businessId: string }[] = [];
      for (const item of validatedInput.items) {
        stockMovements.push({
          type: "SALE",
          quantity: -item.quantity,
          productId: item.productId,
          orderId: validatedInput.orderId,
          businessId,
        });
        rankingItems.push({ productId: item.productId, quantity: item.quantity, price: item.price });
      }

      await bulkUpdateStock(tx, validatedInput.items.map(i => ({ id: i.productId, change: -i.quantity })));
      await tx.stockMovement.createMany({ data: stockMovements });

      // ✅ Crear los OrderItem para que aparezcan en el detalle de la orden
      await tx.orderItem.createMany({
        data: validatedInput.items.map((item) => ({
          orderId: validatedInput.orderId,
          productId: item.productId,
          code: item.code || null,
          description: item.description || null,
          costPrice: item.costPrice || 0,
          price: item.price,
          quantity: item.quantity,
          subTotal: item.subTotal,
        })),
      });

      const itemsTotal = validatedInput.items.reduce((sum, item) => sum + item.subTotal, 0);
      const newTotal = order.total + itemsTotal;

      await tx.order.update({
        where: { id: validatedInput.orderId },
        data: { total: newTotal },
      });

      if (order.clientId) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { increment: itemsTotal } },
        });
      }

      return { success: true };
    }, { maxWait: 10000, timeout: 60000 });

    // ⏰ Respuesta inmediata — ranking + cache en background
    after(async () => {
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        await db.$transaction(async (tx) => {
          await processInBatches(rankingItems, 15, (item: { productId: string; quantity: number; price: number }) => [
            tx.productRanking.upsert({
              where: {
                productId_month_year_businessId: {
                  productId: item.productId, month, year, businessId,
                },
              },
              update: {
                totalSold: { increment: item.quantity },
                totalIncome: { increment: item.quantity * item.price },
              },
              create: {
                productId: item.productId, month, year, businessId,
                totalSold: item.quantity,
                totalIncome: item.quantity * item.price,
              },
            }),
          ]);
        });

        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    return result;
  } catch (error) {
    console.error("Error adding items to order:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al agregar items a la orden",
    };
  }
};

export const updateOrderItem = async (input: z.infer<typeof updateOrderItemSchema>): Promise<ActionResult> => {
  try {
    const validatedInput = updateOrderItemSchema.parse(input);
    const session = await auth();
    const businessId = session?.user?.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };
    const allowNegativeStock = (session?.user?.business?.features as Record<string, unknown>)?.hasNegativeStock === true;

    // Hoist ranking data for after()
    let rankingData: { productId: string; quantity: number; price: number } | null = null;

    const result = await db.$transaction(async (tx) => {
      const orderItem = await tx.orderItem.findUnique({
        where: { id: validatedInput.itemId },
      });

      if (!orderItem) throw new Error("Item no encontrado");

      const order = await tx.order.findUnique({
        where: { id: validatedInput.orderId },
        include: { items: true },
      });

      if (!order) throw new Error("Orden no encontrada");
      if (order.paidStatus === "pago") throw new Error("No se puede modificar una orden pagado");

      const quantityDiff = validatedInput.quantity !== undefined 
        ? validatedInput.quantity - orderItem.quantity 
        : 0;

      if (quantityDiff > 0 && orderItem.productId) {
        const product = await tx.product.findUnique({
          where: { id: orderItem.productId },
        });
        if (!product) {
          throw new Error("Producto no encontrado");
        }
        if (!allowNegativeStock && product.amount < quantityDiff) {
          throw new Error("Stock insuficiente");
        }
      }

      const newQuantity = validatedInput.quantity ?? orderItem.quantity;
      const newPrice = validatedInput.price ?? orderItem.price;
      const newSubTotal = newQuantity * newPrice;

      await tx.orderItem.update({
        where: { id: validatedInput.itemId },
        data: {
          quantity: newQuantity,
          price: newPrice,
          subTotal: newSubTotal,
        },
      });

      if (quantityDiff !== 0 && orderItem.productId) {
        // 🚀 FASE 2: bulkUpdateStock (aunque sea 1 item, consistente)
        await bulkUpdateStock(tx, [{ id: orderItem.productId, change: -quantityDiff }]);

        await tx.stockMovement.create({
          data: {
            type: "SALE",
            quantity: -quantityDiff,
            productId: orderItem.productId,
            orderId: order.id,
            businessId,
          },
        });

        rankingData = {
          productId: orderItem.productId,
          quantity: quantityDiff,
          price: orderItem.price,
        };
      }

      const itemsTotal = order.items.reduce((sum, item) => {
        if (item.id === validatedInput.itemId) {
          return sum + newSubTotal;
        }
        return sum + item.subTotal;
      }, 0);

      const totalDiff = itemsTotal - order.total;

      await tx.order.update({
        where: { id: validatedInput.orderId },
        data: { total: itemsTotal },
      });

      if (order.clientId && totalDiff !== 0) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { increment: totalDiff } },
        });
      }

      return { success: true };
    });

    // ⏰ Respuesta inmediata — ranking + cache en background
    after(async () => {
      try {
        if (rankingData) {
          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();

          await db.$transaction(async (tx) => {
            await tx.productRanking.upsert({
              where: {
                productId_month_year_businessId: {
                  productId: rankingData!.productId,
                  month, year, businessId,
                },
              },
              update: {
                totalSold: { increment: rankingData!.quantity },
                totalIncome: { increment: rankingData!.quantity * rankingData!.price },
              },
              create: {
                productId: rankingData!.productId,
                month, year, businessId,
                totalSold: rankingData!.quantity > 0 ? rankingData!.quantity : 0,
                totalIncome: rankingData!.quantity > 0 ? rankingData!.quantity * rankingData!.price : 0,
              },
            });
          });
        }

        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    return result;
  } catch (error) {
    console.error("Error updating order item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al actualizar el item",
    };
  }
};

export const removeOrderItem = async (input: z.infer<typeof removeOrderItemSchema>): Promise<ActionResult> => {
  try {
    const validatedInput = removeOrderItemSchema.parse(input);
    const session = await auth();
    const businessId = session?.user?.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };

    // Hoist ranking data for after()
    let rankingData: { productId: string; quantity: number; price: number } | null = null;

    const result = await db.$transaction(async (tx) => {
      const orderItem = await tx.orderItem.findUnique({
        where: { id: validatedInput.itemId },
      });

      if (!orderItem) throw new Error("Item no encontrado");

      const order = await tx.order.findUnique({
        where: { id: validatedInput.orderId },
        include: { items: true, client: true },
      });

      if (!order) throw new Error("Orden no encontrada");
      if (order.paidStatus === "pago") throw new Error("No se puede modificar una orden pagado");

      await tx.orderItem.delete({
        where: { id: validatedInput.itemId },
      });

      if (orderItem.productId) {
        // 🚀 FASE 2: bulkUpdateStock (increment stock — change positivo)
        await bulkUpdateStock(tx, [{ id: orderItem.productId, change: orderItem.quantity }]);

        await tx.stockMovement.create({
          data: {
            type: "RETURN",
            quantity: orderItem.quantity,
            productId: orderItem.productId,
            orderId: order.id,
            businessId,
          },
        });

        rankingData = {
          productId: orderItem.productId,
          quantity: -orderItem.quantity,
          price: orderItem.price,
        };
      }

      const newTotal = order.total - orderItem.subTotal;

      await tx.order.update({
        where: { id: validatedInput.orderId },
        data: { total: newTotal },
      });

      if (order.clientId) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { decrement: orderItem.subTotal } },
        });
      }

      return { success: true };
    });

    // ⏰ Respuesta inmediata — ranking + cache en background
    after(async () => {
      try {
        if (rankingData) {
          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();

          await db.$transaction(async (tx) => {
            await tx.productRanking.upsert({
              where: {
                productId_month_year_businessId: {
                  productId: rankingData!.productId,
                  month, year, businessId,
                },
              },
              update: {
                totalSold: { increment: rankingData!.quantity },
                totalIncome: { increment: rankingData!.quantity * rankingData!.price },
              },
              create: {
                productId: rankingData!.productId,
                month, year, businessId,
                totalSold: 0,
                totalIncome: 0,
              },
            });
          });
        }

        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    return result;
  } catch (error) {
    console.error("Error removing order item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al eliminar el item",
    };
  }
};