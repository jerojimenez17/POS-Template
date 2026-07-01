 "use server";

import { db } from "@/lib/db";
import { MovementType, OrderStatus, PaidStatus } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireFeature, assertWritePermission } from "@/lib/auth-gates";
import { fail } from "@/lib/action-result";
import { after } from "next/server";
import { processInBatches, bulkUpdateStock } from "@/lib/batch-utils";

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

    const allowNegativeStock = (permissionResult.data?.business?.features as Record<string, unknown>)?.hasNegativeStock === true;

    if (order.paidStatus === "inpago") {
      const featureResult = await requireFeature("hasClientLedger");
      if (!featureResult.success) return { error: featureResult.error };
    }

    const result = await db.$transaction(async (tx) => {
      // 1a. Validate Stock (rápido, sin escrituras — solo lecturas en memoria)
      const productIds = order.products.map(p => p.id).filter(Boolean);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, amount: true },
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      for (const product of order.products) {
        if (!product.id) continue;
        
        const dbProduct = productMap.get(product.id);
        if (!dbProduct) {
          throw new Error(`Producto ${product.description || product.id} no encontrado`);
        }

        const newAmount = dbProduct.amount - product.amount;
        if (!allowNegativeStock && newAmount < 0) {
          throw new Error(`No hay suficiente stock para ${product.description || product.id}`);
        }
      }

      // 🚀 FASE 2: Bulk UPDATE (raw SQL) — 1 query en vez de N individuales
      const stockUpdates = order.products.filter(p => p.id);
      await bulkUpdateStock(tx, stockUpdates.map(p => ({ id: p.id, change: -p.amount })));

      // 2. Create Order and Items
      const newOrder = await tx.order.create({
        data: {
          businessId: order.businessId,
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
    }, { timeout: 60000 });

    // ⏰ Respuesta inmediata — cache revalidation en background
    after(async () => {
      try {
        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    return result;
  } catch (error) {
    console.error("Transaction failed: ", error);
    return fail(error instanceof Error ? error.message : "Error al guardar Orden");
  }
};

export const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
        const permissionResult = await assertWritePermission();
        if (!permissionResult.success) return { error: permissionResult.error };
        const allowNegativeStock = (permissionResult.data?.business?.features as Record<string, unknown>)?.hasNegativeStock === true;

        // Datos necesarios para el after() (ranking en background)
        let pendingRankingData: { businessId: string; items: { productId: string; quantity: number; price: number }[] } | null = null;

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

                // Decrement stock, create stock movements (ranking va en after())
                const orderItemProductIds = order.items.map(i => i.productId).filter((id): id is string => id !== null);
                const existingProducts = await tx.product.findMany({
                    where: { id: { in: orderItemProductIds } },
                    select: { id: true, amount: true },
                });
                const existingProductMap = new Map(existingProducts.map(p => [p.id, p]));

                // 1. Validación de stock (síncrona, rápida — sin escrituras)
                for (const item of order.items) {
                    if (item.productId) {
                        const product = existingProductMap.get(item.productId);
                        if (!product) {
                            throw new Error(`Producto no encontrado`);
                        }
                        if (!allowNegativeStock && product.amount < item.quantity) {
                            throw new Error(`Stock insuficiente para el producto ${item.description || item.productId}`);
                        }
                    }
                }

                // 🚀 FASE 1+2: Bulk UPDATE + createMany
                const itemsWithProductId = order.items.filter((i): i is typeof i & { productId: string } => i.productId !== null);
                {
                    const stockMovements: { type: MovementType; quantity: number; productId: string; orderId: string; businessId: string; reason: string }[] = [];
                    for (const item of itemsWithProductId) {
                        stockMovements.push({
                            type: "SALE",
                            quantity: -item.quantity,
                            productId: item.productId,
                            orderId: order.id,
                            businessId: order.businessId,
                            reason: `Confirmación de Pedido #${order.id}`
                        });
                    }
                    await bulkUpdateStock(tx, itemsWithProductId.map(i => ({ id: i.productId, change: -i.quantity })));
                    await tx.stockMovement.createMany({ data: stockMovements });
                }

                // Guardamos datos para el ranking en background
                pendingRankingData = {
                    businessId: order.businessId,
                    items: itemsWithProductId.map(i => ({
                        productId: i.productId,
                        quantity: i.quantity,
                        price: i.price,
                    })),
                };
            }

            // Finally, update the status
            await tx.order.update({
                where: { id: orderId },
                data: { status: newStatus }
            });
        }, { timeout: 60000 });

        // ⏰ Transacción completada — respuesta al cliente ya!
        // Ranking + cache en background (no crítico)
        after(async () => {
            try {
                const rankingData = pendingRankingData;
                if (rankingData) {
                    const now = new Date();
                    const month = now.getMonth() + 1;
                    const year = now.getFullYear();

                    await db.$transaction(async (tx) => {
                        await processInBatches(rankingData.items, 15, (item) => [
                            tx.productRanking.upsert({
                                where: {
                                    productId_month_year_businessId: {
                                        productId: item.productId,
                                        month,
                                        year,
                                        businessId: rankingData.businessId,
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
                                    businessId: pendingRankingData!.businessId,
                                    totalSold: item.quantity,
                                    totalIncome: item.quantity * item.price,
                                },
                            }),
                        ]);
                    });
                }

                revalidateTag(CACHE_TAGS.ORDERS, "max");
                revalidateTag(CACHE_TAGS.STOCK, "max");
                revalidateTag(CACHE_TAGS.CLIENTS, "max");
            } catch (bgError) {
                console.error("Background after() error (non-critical):", bgError);
            }
        });

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
