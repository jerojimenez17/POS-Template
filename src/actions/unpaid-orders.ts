"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidatePath } from "next/cache";
import { PaidStatus } from "@prisma/client";

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
            })),
          },
        },
        include: { items: true },
      });

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

    return await db.$transaction(async (tx) => {
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
      await tx.cashMovement.create({ data: cashMovementData } as never);

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

      return { success: true };
    });

    revalidatePath("/orders");
    revalidatePath("/clients");
    revalidatePath("/cashRegister");
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
      const paidStatus = (input.status === "pagado" ? "pago" : input.status) as PaidStatus | undefined;
      orders = await db.order.findMany({
        where: {
          businessId,
          ...(paidStatus && paidStatus !== ("all" as never) ? { paidStatus } : {}),
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