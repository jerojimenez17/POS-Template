 "use server";

import { db } from "@/lib/db";
import { OrderStatus, PaidStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

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
    
    revalidatePath("/orders");
    revalidatePath("/stock");
    revalidatePath("/clients"); // Client balance update
  } catch (error) {
    console.error("Transaction failed: ", error);
    return { error: "Error al guardar Orden: " + (error instanceof Error ? error.message : "Unknown error") };
  }
};

export const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
        await db.order.update({
            where: { id: orderId},
            data: { status: newStatus }
        });
        revalidatePath("/orders");
        return { success: true };
    } catch (error) {
        console.error(error);
        return { error: "Error actualizando estado" };
    }
}

export const updateOrderPaidStatus = async (orderId: string, newStatus: PaidStatus) => {
    try {
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
        
        revalidatePath("/orders");
        return { success: true };
    } catch (error) {
         console.error(error);
        return { error: "Error actualizando estado de pago" };
    }
}
