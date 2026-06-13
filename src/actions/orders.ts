 "use server";

import { db } from "@/lib/db";
import { OrderStatus, PaidStatus } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireFeature, assertWritePermission } from "@/lib/auth-gates";
import { fail } from "@/lib/action-result";

// Type definitions for input to avoid circular dependencies with models
interface OrderProductInput {
  id: string;
  amount: number; // Quantity in order
  price: number; // Sale price
  // Snapshot fields
  code?: string;
  description?: string;
  brand?: string;
  category?: string;
  subCategory?: string;
  unit?: string;
}

interface OrderInput {
  businessId: string
  client: { id: string }
  products: OrderProductInput[]
  date?: Date | string
  total: number
  status?: OrderStatus
  paidStatus?: PaidStatus
  seller?: string
}

export const createOrder = async (order: OrderInput) => {
  try {
    const permissionResult = await assertWritePermission();
    if (!permissionResult.success) return { error: permissionResult.error };

    if (order.paidStatus === "inpago") {
      const featureResult = await requireFeature("hasClientLedger");
      if (!featureResult.success) return { error: featureResult.error };
    }

    return await db.$transaction(async (tx) => {
      // 1. Validate and Update Stock
      for (const product of order.products) {
        if (!product.id) continue;
        
        const dbProduct = await tx.product.findUnique({
          where: { id: product.id },
        });

        if (!dbProduct) {
          throw new Error(`Producto ${product.description || product.id} no encontrado`);
        }

        const newAmount = dbProduct.amount - product.amount;
        if (newAmount < 0) {
            // Note: Firebase impl threw error if < 0. We keep this logic.
             throw new Error(`No hay suficiente stock para ${product.description || product.id}`);
        }

        await tx.product.update({
          where: { id: product.id },
          data: { 
            amount: newAmount, 
            last_update: new Date() 
          },
        });
      }

      // 2. Create Order and Items
const newOrder = await tx.order.create({
  data: {
    businessId: order.businessId, // 👈 esto falta
    clientId: order.client.id,
    date: order.date ? new Date(order.date) : new Date(),
    total: order.total,
    status: order.status || "confirmado",
    paidStatus: order.paidStatus || "inpago",
    seller: order.seller,
    items: {
      create: order.products.map((p) => ({
        productId: p.id || undefined,
        quantity: p.amount,
        price: p.price,
        subTotal: p.price * p.amount,
        description: p.description,
        code: p.code,
      })),
    },
  },
});

      // 3. Update Client Balance
      // Logic from firebase: balance = balance + (-1 * total) (Buying reduces balance/increases debt)
      await tx.client.update({
        where: { id: order.client.id },
        data: {
          balance: { decrement: order.total },
          last_update: new Date(),
        },
      });

      return { success: "Orden creada", orderId: newOrder.id };
    });
    
    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.STOCK, "max");
    revalidateTag(CACHE_TAGS.CLIENTS, "max");
  } catch (error) {
    console.error("Transaction failed: ", error);
    return fail(error instanceof Error ? error.message : "Error al guardar Orden");
  }
};

export const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
        const permissionResult = await assertWritePermission();
        if (!permissionResult.success) return { error: permissionResult.error };
        await db.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id: orderId },
                include: { items: true }
            });

            if (!order) throw new Error("Orden no encontrada");

            // If transitioning from pendiente to confirmado, perform stock and balance updates
            if (order.status === "pendiente" && newStatus === "confirmado") {
                // Update client balance (increase debt)
                if (order.clientId) {
                    await tx.client.update({
                        where: { id: order.clientId },
                        data: {
                            balance: { decrement: order.total },
                            last_update: new Date(),
                        }
                    });
                }

                // Decrement stock, create stock movements, and update product ranking
                const now = new Date();
                const month = now.getMonth() + 1;
                const year = now.getFullYear();

                for (const item of order.items) {
                    if (item.productId) {
                        const product = await tx.product.findUnique({
                            where: { id: item.productId }
                        });

                        if (!product || product.amount < item.quantity) {
                            throw new Error(`Stock insuficiente para el producto ${item.description || item.productId}`);
                        }

                        await tx.product.update({
                            where: { id: item.productId },
                            data: { amount: { decrement: item.quantity } }
                        });

                        await tx.stockMovement.create({
                            data: {
                                type: "SALE",
                                quantity: -item.quantity,
                                productId: item.productId,
                                orderId: order.id,
                                businessId: order.businessId,
                                reason: `Confirmación de Pedido #${order.id}`
                            }
                        });

                        await tx.productRanking.upsert({
                            where: {
                                productId_month_year_businessId: {
                                    productId: item.productId,
                                    month,
                                    year,
                                    businessId: order.businessId,
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
                                businessId: order.businessId,
                                totalSold: item.quantity,
                                totalIncome: item.quantity * item.price,
                            },
                        });
                    }
                }
            }

            // Finally, update the status
            await tx.order.update({
                where: { id: orderId },
                data: { status: newStatus }
            });
        });

        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
        return { success: true };
    } catch (error) {
        console.error(error);
        return fail(error instanceof Error ? error.message : "Error actualizando estado");
    }
}

export const updateOrderPaidStatus = async (orderId: string, newStatus: PaidStatus) => {
    try {
        const permissionResult = await assertWritePermission();
        if (!permissionResult.success) return { error: permissionResult.error };

        if (newStatus === "inpago") {
            const featureResult = await requireFeature("hasClientLedger");
            if (!featureResult.success) return { error: featureResult.error };
        }
        await db.$transaction(async (tx) => {
           const order = await tx.order.findUnique({ where: { id: orderId } });
           if (!order) throw new Error("Orden no encontrada");
           
           if (order.paidStatus === newStatus) return; // No change

           // If changing to 'pago', we might need to restore balance?
           // Firebase 'paidOrder': updateBalance(client, total) -> adds total back to balance.
           if (newStatus === "pago" && order.paidStatus !== "pago") {
               if (order.clientId) {
                   await tx.client.update({
                       where: { id: order.clientId },
                       data: { balance: { increment: order.total } } 
                   });
               }
           }
           if (newStatus === "inpago" && order.paidStatus === "pago") {
                if (order.clientId) {
                   await tx.client.update({
                       where: { id: order.clientId },
                       data: { balance: { decrement: order.total } } 
                   });
                }
           }

           await tx.order.update({
             where: { id: orderId },
             data: { paidStatus: newStatus }
           });
        });
        
        revalidateTag(CACHE_TAGS.ORDERS, "max");
        return { success: true };
    } catch (error) {
         console.error(error);
        return fail("Error actualizando estado de pago");
    }
}
