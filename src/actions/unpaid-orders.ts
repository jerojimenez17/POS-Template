"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidatePath } from "next/cache";
import { PaidStatus } from "@prisma/client";
import { z } from "zod";
import { pusherServer } from "@/lib/pusher-server";

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
    const session = await auth();
    const businessId = session?.user?.businessId || input.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };

    return await db.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: input.clientId },
      });
      if (!client) throw new Error("Cliente no encontrado");

      for (const item of input.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product) {
          throw new Error(`Producto ${item.description || item.productId} no encontrado`);
        }
        if (product.amount < item.quantity) {
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
        include: { items: true },
      });

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      for (const item of input.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { amount: { decrement: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            type: "SALE",
            quantity: -item.quantity,
            productId: item.productId,
            orderId: order.id,
            businessId,
          },
        });

        await tx.productRanking.upsert({
          where: {
            productId_month_year_businessId: {
              productId: item.productId,
              month,
              year,
              businessId,
            },
          },
          update: { 
            totalSold: { increment: item.quantity },
            totalIncome: { increment: item.quantity * item.price }
          },
          create: {
            productId: item.productId,
            month,
            year,
            businessId,
            totalSold: item.quantity,
            totalIncome: item.quantity * item.price,
          },
        });
      }

      await tx.client.update({
        where: { id: input.clientId },
        data: { balance: { increment: input.total } },
      });

      return { success: true, data: order };
    });

    revalidatePath("/orders");
    revalidatePath("/stock");
    revalidatePath("/clients");
    revalidatePath("/account-ledger");
    await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
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

    revalidatePath("/orders");
    revalidatePath("/clients");
    revalidatePath("/cashRegister");
    revalidatePath("/account-ledger");
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

    return await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { client: true, items: { include: { product: true } } },
      });
      if (!order) throw new Error("Orden no encontrada");

      if (order.paidStatus === "pago") {
        throw new Error("No se puede cancelar una orden ya pagado");
      }

      for (const item of order.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { amount: { increment: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              type: "RETURN",
              quantity: item.quantity,
              productId: item.productId,
              orderId: order.id,
              businessId,
            },
          });

          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();

          await tx.productRanking.upsert({
            where: {
              productId_month_year_businessId: {
                productId: item.productId,
                month,
                year,
                businessId,
              },
            },
            update: { 
              totalSold: { decrement: item.quantity },
              totalIncome: { decrement: item.quantity * item.price }
            },
            create: {
              productId: item.productId,
              month,
              year,
              businessId,
              totalSold: 0,
              totalIncome: 0,
            },
          });
        }
      }

      if (order.clientId) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { decrement: order.total } },
        });
      }

      await tx.order.update({
        where: { id: input.orderId },
        data: { paidStatus: "inpago" },
      } as never);

      return { success: true };
    });

    revalidatePath("/orders");
    revalidatePath("/stock");
    revalidatePath("/clients");
    await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
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
    } else {
      const isPending = input.status === "pendiente";
      const paidStatus = (input.status === "pagado" ? "pago" : input.status) as PaidStatus | undefined;
      orders = await db.order.findMany({
        where: {
          businessId,
          // Si estamos buscando "pendientes", filtramos por status = pendiente
          ...(isPending ? { status: "pendiente" } : { status: { not: "pendiente" } }),
          // Y solo aplicamos el filtro de paidStatus si no es "pending" ni "all"
          ...(!isPending && paidStatus && paidStatus !== ("all" as never) ? { paidStatus } : {}),
        },
        include: {
          client: true,
        },
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

export const getClientUnpaidOrder = async (clientId: string, businessId: string): Promise<ActionResult> => {
  try {
    const session = await auth();
    const businessIdFinal = session?.user?.businessId || businessId;
    if (!businessIdFinal) return { success: false, error: "No autorizado" };

    return await db.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          clientId,
          businessId: businessIdFinal,
          paidStatus: "inpago",
        },
        include: {
          items: true,
          client: true,
        },
        orderBy: { date: "desc" },
      });

      return { success: true, data: order };
    });
  } catch (error) {
    console.error("Error getting client unpaid order:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al obtener la orden",
    };
  }
};

export const addItemsToOrder = async (input: z.infer<typeof addItemsToOrderSchema>): Promise<ActionResult> => {
  try {
    const validatedInput = addItemsToOrderSchema.parse(input);
    const session = await auth();
    const businessId = session?.user?.businessId || validatedInput.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };

    return await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: validatedInput.orderId },
        include: { client: true, items: true },
      });

      if (!order) throw new Error("Orden no encontrada");
      if (order.paidStatus === "pago") throw new Error("No se puede modificar una orden pagado");

      for (const item of validatedInput.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product) {
          throw new Error(`Producto ${item.description || item.productId} no encontrado`);
        }
        if (product.amount < item.quantity) {
          throw new Error(`Stock insuficiente para ${item.description || item.productId}`);
        }
      }

      const currentTimestamp = new Date();
      const month = currentTimestamp.getMonth() + 1;
      const year = currentTimestamp.getFullYear();

      for (const item of validatedInput.items) {
        await tx.orderItem.create({
          data: {
            orderId: validatedInput.orderId,
            productId: item.productId,
            code: item.code,
            description: item.description,
            costPrice: item.costPrice || 0,
            price: item.price,
            quantity: item.quantity,
            subTotal: item.subTotal,
            addedAt: currentTimestamp,
          },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: { amount: { decrement: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            type: "SALE",
            quantity: -item.quantity,
            productId: item.productId,
            orderId: order.id,
            businessId,
          },
        });

        await tx.productRanking.upsert({
          where: {
            productId_month_year_businessId: {
              productId: item.productId,
              month,
              year,
              businessId,
            },
          },
          update: { 
            totalSold: { increment: item.quantity },
            totalIncome: { increment: item.quantity * item.price }
          },
          create: {
            productId: item.productId,
            month,
            year,
            businessId,
            totalSold: item.quantity,
            totalIncome: item.quantity * item.price,
          },
        });
      }

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

      revalidatePath("/orders");
      revalidatePath("/stock");
      revalidatePath("/clients");
      revalidatePath("/account-ledger");
      await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

      return { success: true };
    });
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

    return await db.$transaction(async (tx) => {
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
        if (!product || product.amount < quantityDiff) {
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
        await tx.product.update({
          where: { id: orderItem.productId },
          data: { amount: { decrement: quantityDiff } },
        });

        await tx.stockMovement.create({
          data: {
            type: "SALE",
            quantity: -quantityDiff,
            productId: orderItem.productId,
            orderId: order.id,
            businessId,
          },
        });

        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        await tx.productRanking.upsert({
          where: {
            productId_month_year_businessId: {
              productId: orderItem.productId,
              month,
              year,
              businessId,
            },
          },
          update: { 
            totalSold: { increment: quantityDiff },
            totalIncome: { increment: quantityDiff * orderItem.price }
          },
          create: {
            productId: orderItem.productId,
            month,
            year,
            businessId,
            totalSold: quantityDiff > 0 ? quantityDiff : 0,
            totalIncome: quantityDiff > 0 ? quantityDiff * orderItem.price : 0,
          },
        });
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

      revalidatePath("/orders");
      revalidatePath("/stock");
      revalidatePath("/clients");
      await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

      return { success: true };
    });
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

    return await db.$transaction(async (tx) => {
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
        await tx.product.update({
          where: { id: orderItem.productId },
          data: { amount: { increment: orderItem.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            type: "RETURN",
            quantity: orderItem.quantity,
            productId: orderItem.productId,
            orderId: order.id,
            businessId,
          },
        });

        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        await tx.productRanking.upsert({
          where: {
            productId_month_year_businessId: {
              productId: orderItem.productId,
              month,
              year,
              businessId,
            },
          },
          update: { 
            totalSold: { decrement: orderItem.quantity },
            totalIncome: { decrement: orderItem.quantity * orderItem.price }
          },
          create: {
            productId: orderItem.productId,
            month,
            year,
            businessId,
            totalSold: 0,
            totalIncome: 0,
          },
        });
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

      revalidatePath("/orders");
      revalidatePath("/stock");
      revalidatePath("/clients");
      await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

      return { success: true };
    });
  } catch (error) {
    console.error("Error removing order item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al eliminar el item",
    };
  }
};