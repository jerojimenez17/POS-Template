"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { pusherServer } from "@/lib/pusher-server";
import { requireFeature, assertWritePermission } from "@/lib/auth-gates";
import { fail } from "@/lib/action-result";
import { getDailyUsage, checkDailyLimit, incrementDailyUsage } from "@/lib/daily-limits";
import { after } from "next/server";
import { MovementType } from "@prisma/client";
import { OrderUpdateChanges } from "@/models/OrderUpdateChanges";
import { OrderSnapshot } from "@/models/OrderSnapshot";
import { processInBatches, bulkUpdateStock } from "@/lib/batch-utils";

// Interfaces para tipado fuerte
interface SaleProduct {
  id: string;
  code: string;
  description: string;
  price?: number;
  salePrice?: number;
  amount: number;
}

interface ProcessSaleInput {
  total: number;
  totalWithDiscount?: number;
  seller: string;
  paidMethod?: string;
  secondPaidMethod?: string;
  totalSecondMethod?: number | null;
  discount?: number;
  clientId?: string;
  twoMethods?: boolean;
  billType?: string;
  products: SaleProduct[];
  clientIvaCondition?: string;
  clientDocumentNumber?: string;
  CAE?: {
    CAE: string;
    vencimiento: string;
    nroComprobante: number;
    qrData: string;
  };
}

export const processSaleAction = async (billState: ProcessSaleInput) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  // Gate: check payment status (MOROSO) — blocks ALL sales unconditionally
  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error };

  // Gate: check AFIP billing feature when CAE is present (CAE is Json?, check actual number)
  const billCae = billState.CAE as { CAE?: string } | null | undefined;
  if (billCae?.CAE) {
    const featureCheck = await requireFeature("hasAfipBilling");
    if (!featureCheck.success) {
      return { error: featureCheck.error || "Esta funcionalidad no está disponible en tu plan actual." };
    }
  }

  // Daily limit check for DEMO plan
  const usage = await getDailyUsage(businessId);
  const limitCheck = await checkDailyLimit(businessId, "dailySalesLimit", usage.salesCount);
  if (!limitCheck.allowed) {
    return {
      error: `Has superado el límite diario de ventas (${limitCheck.limit}). En tu plan actual solo podés realizar ${limitCheck.limit} ventas por día.`,
    };
  }

  try {
    const session = await auth();
    const businessId = session?.user?.businessId;
    if (!businessId) return { error: "No autorizado" };
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const discountPercent = Number(billState.discount) || 0;
    const isTwoMethods = !!billState.twoMethods;
    const totalSecondMethodParsed = isTwoMethods ? (Number(billState.totalSecondMethod) || 0) : 0;

    const total = billState.totalWithDiscount || billState.total;
    const discountAmount = billState.total * discountPercent * 0.01;
    
    const result = await db.$transaction(async (tx) => {
      const activeSession = await tx.cashboxSession.findFirst({
        where: { userId: session.user!.id, status: "OPEN" },
      });
      if (!activeSession) {
        throw new Error("No hay una sesión de caja abierta.");
      }

      const order = await tx.order.create({
        data: {
          total: total,
          seller: billState.seller,
          status: "confirmado",
          paidStatus: "pago",
          paymentMethod: billState.paidMethod || "Efectivo",
          paymentMethod2: isTwoMethods ? billState.secondPaidMethod : null,
          totalMethod2: isTwoMethods ? totalSecondMethodParsed : null,
          discountPercentage: discountPercent,
          discountAmount: discountAmount,
          businessId: businessId,
          clientId: billState.clientId,
          clientIvaCondition: billState.clientIvaCondition,
          clientDocumentNumber: billState.clientDocumentNumber,
          CAE: billState.CAE,
          cashboxSessionId: activeSession.id,
          items: {
            create: billState.products.map((p) => ({
              productId: p.id,
              code: p.code,
              description: p.description,
              costPrice: p.price || 0,
              price: p.salePrice || p.price || 0,
              quantity: p.amount,
              subTotal: (p.salePrice || p.price || 0) * p.amount,
            })),
          },
        },
      });

      // 🚀 FASE 1+2: Bulk UPDATE (raw SQL) + Bulk INSERT (createMany)
      // Antes: 2 ops × N productos = 2N queries
      // Ahora: 1 bulk UPDATE + 1 bulk INSERT = 2 queries total
      const stockMovements: {
        type: MovementType;
        quantity: number;
        productId: string;
        orderId: string;
        businessId: string;
        reason: string;
      }[] = [];
      for (const item of billState.products) {
        stockMovements.push({
          type: "SALE",
          quantity: -item.amount,
          productId: item.id,
          orderId: order.id,
          businessId: businessId,
          reason: `Venta #${order.id}`,
        });
      }

      await bulkUpdateStock(tx, billState.products.map(p => ({ id: p.id, change: -p.amount })));
      await tx.stockMovement.createMany({ data: stockMovements });

      let cashToIncrement = 0;
      if (billState.paidMethod === "Efectivo") {
        cashToIncrement += (total - totalSecondMethodParsed);
      }
      if (isTwoMethods && billState.secondPaidMethod === "Efectivo") {
        cashToIncrement += totalSecondMethodParsed;
      }

      if (cashToIncrement > 0) {
        await tx.cashBox.update({
          where: { id: activeSession.cashboxId },
          data: { total: { increment: cashToIncrement } },
        });
      }

      const movements: { id: string; total: number; paidMethod: string | null; businessId: string; seller: string | null; date: Date }[] = [];

      if (isTwoMethods) {
        if (total - totalSecondMethodParsed > 0 && billState.paidMethod === "Efectivo") {
          const m1 = await tx.cashMovement.create({
            data: {
              total: total - totalSecondMethodParsed,
              seller: billState.seller,
              paidMethod: billState.paidMethod || "Efectivo",
              businessId: businessId,
              cashboxSessionId: activeSession.id,
              date: now,
            },
          });
          movements.push(m1);
        }
        if (totalSecondMethodParsed > 0 && billState.secondPaidMethod === "Efectivo") {
          const m2 = await tx.cashMovement.create({
            data: {
              total: totalSecondMethodParsed,
              seller: billState.seller,
              paidMethod: billState.secondPaidMethod || "Efectivo",
              businessId: businessId,
              cashboxSessionId: activeSession.id,
              date: now,
            },
          });
          movements.push(m2);
        }
      } else if (billState.paidMethod === "Efectivo") {
        const m = await tx.cashMovement.create({
          data: {
            total: total,
            seller: billState.seller,
            paidMethod: billState.paidMethod || "Efectivo",
            businessId: businessId,
            cashboxSessionId: activeSession.id,
            date: now,
          },
        });
        movements.push(m);
      }

      return { order, movements };
    }, { maxWait: 10000, timeout: 60000 });

    // ⏰ Respuesta al cliente ya!
    // El resto (ranking, pusher, cache) va en after() — no crítico para el usuario
    after(async () => {
      try {
        // Ranking de productos (eventual consistency — analytics no crítico)
        await db.$transaction(async (tx) => {
          await processInBatches(billState.products, 15, (item) => [
            tx.productRanking.upsert({
              where: {
                productId_month_year_businessId: {
                  productId: item.id,
                  month,
                  year,
                  businessId,
                },
              },
              update: {
                totalSold: { increment: item.amount },
                totalIncome: { increment: item.amount * (item.salePrice || item.price || 0) },
              },
              create: {
                productId: item.id,
                month,
                year,
                businessId,
                totalSold: item.amount,
                totalIncome: item.amount * (item.salePrice || item.price || 0),
              },
            }),
          ]);
        });

        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

        for (const movement of result.movements) {
          await pusherServer.trigger(`movements-${businessId}`, "new-movement", movement);
        }

        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CASHBOX, "max");
        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.SALES, "max");
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    // Track daily usage for DEMO plan limits
    await incrementDailyUsage(businessId, "salesCount");

    return { success: true, orderId: result.order.id };
  } catch (error) {
    console.error("Error processing sale:", error);
    return fail("Error al procesar la venta");
  }
};

export const processReturnAction = async (data: { orderId: string; items: { productId: string; quantity: number; refundAmount: number }[]; reason: string }) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error, code: permission.code };

  try {
    const session = await auth();
    const businessId = session?.user?.businessId;
    if (!businessId) return { error: "No autorizado" };
    const result = await db.$transaction(async (tx) => {
      const activeSession = await tx.cashboxSession.findFirst({
        where: { userId: session.user!.id, status: "OPEN" },
      });
      if (!activeSession) {
        throw new Error("No hay una sesión de caja abierta.");
      }

      const returnRecord = await tx.saleReturn.create({
        data: {
          orderId: data.orderId,
          businessId,
          reason: data.reason,
          total: data.items.reduce((acc, item) => acc + item.refundAmount, 0),
        },
      });

      // Buscar todos los orderItems de una sola vez
      const orderItems = await tx.orderItem.findMany({
        where: { orderId: data.orderId },
        select: { id: true, productId: true },
      });
      const orderItemMap = new Map(orderItems.map((oi) => [oi.productId, oi.id]));

      // 🚀 FASE 1+2: Bulk UPDATE (raw SQL) + Bulk INSERT (createMany)
      // Antes: 3 ops × N productos = 3N queries
      // Ahora: 1 bulk UPDATE + 2× createMany = 3 queries total
      {
        const stockMovements: { type: MovementType; quantity: number; productId: string; businessId: string; reason: string }[] = [];
        const returnItems: { returnId: string; orderItemId: string; productId: string; quantity: number; refundAmount: number }[] = [];

        for (const item of data.items) {
          const orderItemId = orderItemMap.get(item.productId);
          if (!orderItemId) throw new Error(`OrderItem not found for product ${item.productId}`);

          stockMovements.push({
            type: "RETURN",
            quantity: item.quantity,
            productId: item.productId,
            businessId,
            reason: `Devolución #${returnRecord.id} (Ref: Venta #${data.orderId})`,
          });
          returnItems.push({
            returnId: returnRecord.id,
            orderItemId,
            productId: item.productId,
            quantity: item.quantity,
            refundAmount: item.refundAmount,
          });
        }

        await bulkUpdateStock(tx, data.items.map(i => ({ id: i.productId, change: i.quantity })));
        await tx.stockMovement.createMany({ data: stockMovements });
        await tx.saleReturnItem.createMany({ data: returnItems });
      }

      const totalRefund = data.items.reduce((acc, item) => acc + item.refundAmount, 0);
      await tx.cashBox.update({
        where: { id: activeSession.cashboxId },
        data: { total: { decrement: totalRefund } },
      });

      await tx.cashMovement.create({
        data: {
          total: -totalRefund,
          paidMethod: "Devolución",
          businessId,
          cashboxSessionId: activeSession.id,
          seller: session?.user?.email,
          date: new Date(),
        },
      });

      return returnRecord;
    }, { maxWait: 10000, timeout: 60000 });

    // ⏰ Respuesta inmediata — non-critical en background
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

    return { success: true, returnId: result.id };
  } catch (error) {
    console.error("Error processing return:", error);
    return fail("Error al procesar la devolución");
  }
};

export const updateOrderAction = async (
  orderId: string,
  updatedData: ProcessSaleInput
) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  const userId = session?.user?.id;
  const userRole = session?.user?.role;

  if (!businessId || !userId) return { error: "No autorizado" };

  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error, code: permission.code };

  if (userRole !== "ADMIN")
    return { error: "Solo los administradores pueden editar ventas" };

  try {
    const session = await auth();
    const businessId = session?.user?.businessId;
    const userId = session?.user?.id;
    const userRole = session?.user?.role;

    if (!businessId || !userId) return { error: "No autorizado" };
    if (userRole !== "ADMIN")
      return { error: "Solo los administradores pueden editar ventas" };
    const result = await db.$transaction(async (tx) => {
      const existingOrder = await tx.order.findFirst({
        where: { id: orderId, businessId },
        include: { items: true },
      });

      if (!existingOrder) throw new Error("Orden no encontrada");

      // Block editing invoiced sales (CAE is Json?, check actual CAE number not just truthy)
      const orderCae = existingOrder.CAE as { CAE?: string } | null;
      if (orderCae?.CAE) {
        throw new Error("Esta venta ya fue facturada. No se puede editar. Genere una nota de crédito.");
      }

      // 🔹 calcular versión
      const lastUpdate = await tx.orderUpdate.findFirst({
        where: { orderId },
        orderBy: { version: "desc" },
      });

      const version = (lastUpdate?.version ?? 0) + 1;

      // 🔹 calcular cambios
      // Helper: normalize strings for comparison
      const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

      const ivaChanged = (() => {
        const from = existingOrder.clientIvaCondition;
        const to = updatedData.clientIvaCondition ?? null;
        const docFrom = existingOrder.clientDocumentNumber;
        const docTo = updatedData.clientDocumentNumber ?? null;
        if (norm(from) !== norm(to) || norm(docFrom) !== norm(docTo)) {
          return {
            from: { condition: from, documentNumber: docFrom },
            to: { condition: to, documentNumber: docTo },
          };
        }
        return undefined;
      })();

      // Bill type from the latest history (not stored on Order, but tracked via updates)
      const billTypeChanged = (() => {
        if (!updatedData.billType) return undefined;
        // Try to get previous bill type from last history entry
        let prevBillType: string | null = null;
        if (lastUpdate?.changes) {
          try {
            const prevChanges = lastUpdate.changes as Record<string, unknown>;
            prevBillType = (prevChanges.billTypeTo as string | null) ?? null;
          } catch { /* ignore */ }
        }
        // Only detect change when we have a recorded previous value (skip first edit — no baseline)
        if (prevBillType !== null && norm(prevBillType) !== norm(updatedData.billType)) {
          return {
            from: prevBillType,
            to: updatedData.billType,
          };
        }
        return undefined;
      })();

      const paymentChanged = (() => {
        const fromMethod = existingOrder.paymentMethod;
        const toMethod = updatedData.paidMethod ?? null;
        const fromTwo = !!existingOrder.paymentMethod2;
        const toTwo = !!updatedData.twoMethods;
        const fromSecond = existingOrder.paymentMethod2;
        // Only compare second method when twoMethods is active on either side
        // (form always defaults secondPaidMethod even when twoMethods=false)
        const toSecond = toTwo ? (updatedData.secondPaidMethod ?? null) : null;
        if (norm(fromMethod) !== norm(toMethod) || fromTwo !== toTwo || norm(fromSecond) !== norm(toSecond)) {
          return {
            from: { method: fromMethod, twoMethods: fromTwo, secondMethod: fromSecond },
            to: { method: toMethod, twoMethods: toTwo, secondMethod: toSecond },
          };
        }
        return undefined;
      })();

      const discountChanged = (() => {
        const from = existingOrder.discountPercentage;
        const to = updatedData.discount;
        if (from !== to) {
          return { from: from ?? 0, to: to ?? 0 };
        }
        return undefined;
      })();

      const changes: OrderUpdateChanges = {
        type: "ITEMS_UPDATED",
        items: updatedData.products.map((p) => ({
          productId: p.id,
          description: p.description,
          code: p.code,
          quantity: {
            from:
              existingOrder.items.find((i) => i.productId === p.id)?.quantity ??
              0,
            to: p.amount,
          },
        })),
        ...(ivaChanged && { ivaChanged }),
        ...(billTypeChanged && { billTypeChanged }),
        ...(paymentChanged && { paymentChanged }),
        ...(discountChanged && { discountChanged }),
        // Store current billType for future history reads (order doesn't store it)
        ...(updatedData.billType ? { billTypeTo: updatedData.billType } : {}),
      };

      // 🔹 snapshot cada 10 versiones
      let snapshot: OrderSnapshot | null = null;

      if (version % 10 === 0) {
        snapshot = {
          id: existingOrder.id,
          total: existingOrder.total,
          status: existingOrder.status,
          paidStatus: existingOrder.paidStatus,
          discountAmount: existingOrder.discountAmount,
          discountPercentage: existingOrder.discountPercentage,
          clientId: existingOrder.clientId,
          items: existingOrder.items.map((item) => ({
            productId: item.productId,
            code: item.code,
            description: item.description,
            quantity: item.quantity,
            price: item.price,
            subTotal: item.subTotal,
          })),
        };
      }

      // 🔹 guardar update
      await tx.orderUpdate.create({
        data: {
          orderId,
          businessId,
          updatedById: userId,
          version,
          type: changes.type,
          changes: changes as OrderUpdateChanges,
          snapshot: snapshot as OrderSnapshot,
        },
      });

      // 🔹 ajustar stock por delta (en vez de revertir todo + recrear todo)
      // Calcula la diferencia neta por producto y registra UN SOLO movimiento
      const oldQtyMap = new Map(existingOrder.items.filter(i => i.productId).map(i => [i.productId!, i.quantity]));
      const newQtyMap = new Map(updatedData.products.map(p => [p.id, p.amount]));
      const allProductIds = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);

      for (const productId of allProductIds) {
        const oldQty = oldQtyMap.get(productId) ?? 0;
        const newQty = newQtyMap.get(productId) ?? 0;
        const delta = newQty - oldQty;

        if (delta > 0) {
          // Se vendieron más unidades que antes
          await tx.product.update({
            where: { id: productId },
            data: { amount: { decrement: delta } },
          });
          await tx.stockMovement.create({
            data: {
              type: "SALE",
              quantity: -delta,
              productId,
              orderId,
              businessId,
              reason: `Actualización por edición de Venta #${orderId}`,
            },
          });
        } else if (delta < 0) {
          // Se vendieron menos unidades que antes (se devuelven)
          const absDelta = Math.abs(delta);
          await tx.product.update({
            where: { id: productId },
            data: { amount: { increment: absDelta } },
          });
          await tx.stockMovement.create({
            data: {
              type: "ADJUSTMENT",
              quantity: absDelta,
              productId,
              orderId,
              businessId,
              reason: `Reversión por edición de Venta #${orderId}`,
            },
          });
        }
        // delta === 0: sin cambios, no se registra movimiento
      }

      // 🔹 ajustar rankings de productos (Fix 7A)
      const orderDate = existingOrder.date;
      const orderMonth = orderDate.getMonth() + 1;
      const orderYear = orderDate.getFullYear();

      // Decrement rankings for removed/reduced old items
      for (const item of existingOrder.items) {
        if (item.productId) {
          const newItem = updatedData.products.find(p => p.id === item.productId);
          const newQuantity = newItem?.amount ?? 0;
          const delta = item.quantity - newQuantity;

          if (delta > 0) {
            await tx.productRanking.upsert({
              where: {
                productId_month_year_businessId: {
                  productId: item.productId,
                  month: orderMonth,
                  year: orderYear,
                  businessId,
                },
              },
              update: {
                totalSold: { decrement: delta },
                totalIncome: { decrement: delta * item.price },
              },
              create: {
                productId: item.productId,
                month: orderMonth,
                year: orderYear,
                businessId,
                totalSold: 0,
                totalIncome: 0,
              },
            });
          }

          if (delta < 0) {
            const addedQuantity = Math.abs(delta);
            const newItemPrice = updatedData.products.find(p => p.id === item.productId)?.salePrice || item.price;
            await tx.productRanking.upsert({
              where: {
                productId_month_year_businessId: {
                  productId: item.productId,
                  month: orderMonth,
                  year: orderYear,
                  businessId,
                },
              },
              update: {
                totalSold: { increment: addedQuantity },
                totalIncome: { increment: addedQuantity * newItemPrice },
              },
              create: {
                productId: item.productId,
                month: orderMonth,
                year: orderYear,
                businessId,
                totalSold: addedQuantity,
                totalIncome: addedQuantity * newItemPrice,
              },
            });
          }
        }
      }

      // Increment rankings for brand new items (not in old order)
      for (const item of updatedData.products) {
        const oldItem = existingOrder.items.find(i => i.productId === item.id);
        if (!oldItem) {
          await tx.productRanking.upsert({
            where: {
              productId_month_year_businessId: {
                productId: item.id,
                month: orderMonth,
                year: orderYear,
                businessId,
              },
            },
            update: {
              totalSold: { increment: item.amount },
              totalIncome: { increment: (item.salePrice || item.price || 0) * item.amount },
            },
            create: {
              productId: item.id,
              month: orderMonth,
              year: orderYear,
              businessId,
              totalSold: item.amount,
              totalIncome: (item.salePrice || item.price || 0) * item.amount,
            },
          });
        }
      }

      // 🔹 recalcular totales
      const discountPercent = Number(updatedData.discount) || 0;
      const total = updatedData.totalWithDiscount || updatedData.total;
      const discountAmount = updatedData.total * discountPercent * 0.01;
      const isTwoMethodsUpdate = !!updatedData.twoMethods;
      const totalSecondMethodParsedUpdate = isTwoMethodsUpdate ? (Number(updatedData.totalSecondMethod) || 0) : 0;

      // 🔹 actualizar orden
      await tx.order.update({
        where: { id: orderId },
        data: {
          total,
          seller: updatedData.seller,
          paymentMethod: updatedData.paidMethod || "Efectivo",
          paymentMethod2: isTwoMethodsUpdate ? updatedData.secondPaidMethod : null,
          totalMethod2: isTwoMethodsUpdate ? totalSecondMethodParsedUpdate : null,
          discountPercentage: discountPercent,
          discountAmount,
          clientId: updatedData.clientId,
          clientIvaCondition: updatedData.clientIvaCondition,
          clientDocumentNumber: updatedData.clientDocumentNumber,
          items: {
            deleteMany: {},
            create: updatedData.products.map((p) => ({
              productId: p.id,
              code: p.code,
              description: p.description,
              costPrice: p.price || 0,
              price: p.salePrice || p.price || 0,
              quantity: p.amount,
              subTotal: (p.salePrice || p.price || 0) * p.amount,
            })),
          },
        },
      });

      // 🔹 ajustar balance de cliente (Fix 7B)
      const oldTotal = existingOrder.total;
      const newTotal = total;
      const totalDiff = newTotal - oldTotal;

      const oldClientId = existingOrder.clientId;
      const newClientId = updatedData.clientId;

      // If client changed, remove balance from old client, add to new client
      if (oldClientId !== newClientId) {
        if (oldClientId) {
          await tx.client.update({
            where: { id: oldClientId },
            data: { balance: { decrement: oldTotal } },
          });
        }
        if (newClientId) {
          await tx.client.update({
            where: { id: newClientId },
            data: { balance: { increment: newTotal } },
          });
        }
      } else if (oldClientId && totalDiff !== 0) {
        // Same client, different total
        await tx.client.update({
          where: { id: oldClientId },
          data: { balance: { increment: totalDiff } },
        });
      }

      // 🔹 ajustar CashMovements y CashBox por edición (Fix 7C)
      const oldCashMovements = await tx.cashMovement.findMany({
        where: { orderId },
      });

      const oldCashTotal = oldCashMovements.reduce((sum, m) => sum + m.total, 0);

      // Calcular nuevo total en efectivo según medios de pago actualizados
      const isTwoMethodsEdit = !!updatedData.twoMethods;
      const totalSecondMethodEdit = isTwoMethodsEdit ? (Number(updatedData.totalSecondMethod) || 0) : 0;
      const totalEdit = updatedData.totalWithDiscount || updatedData.total;

      let newCashTotal = 0;
      if (updatedData.paidMethod === "Efectivo") {
        newCashTotal += totalEdit - totalSecondMethodEdit;
      }
      if (isTwoMethodsEdit && updatedData.secondPaidMethod === "Efectivo") {
        newCashTotal += totalSecondMethodEdit;
      }

      const cashDelta = newCashTotal - oldCashTotal;

      // Solo tocar CashBox/CashMovement si realmente cambió algo en efectivo
      if (cashDelta !== 0 || oldCashMovements.length > 0 || newCashTotal > 0) {
        // Encontrar sesión activa del usuario que edita
        const activeSession = await tx.cashboxSession.findFirst({
          where: { userId, status: "OPEN" },
        });
        if (!activeSession) {
          throw new Error("No hay una sesión de caja abierta.");
        }

        // Ajustar CashBox por el delta (puede ser positivo o negativo)
        if (cashDelta !== 0) {
          await tx.cashBox.update({
            where: { id: activeSession.cashboxId },
            data: { total: { increment: cashDelta } },
          });
        }

        // Eliminar movimientos viejos (son reemplazados por los nuevos)
        if (oldCashMovements.length > 0) {
          await tx.cashMovement.deleteMany({
            where: { orderId },
          });
        }

        // Crear nuevos movimientos si hay efectivo involucrado
        if (newCashTotal > 0) {
          if (isTwoMethodsEdit) {
            if (totalEdit - totalSecondMethodEdit > 0 && updatedData.paidMethod === "Efectivo") {
              await tx.cashMovement.create({
                data: {
                  total: totalEdit - totalSecondMethodEdit,
                  seller: updatedData.seller,
                  paidMethod: updatedData.paidMethod || "Efectivo",
                  businessId,
                  cashboxSessionId: activeSession.id,
                  orderId,
                  date: new Date(),
                },
              });
            }
            if (totalSecondMethodEdit > 0 && updatedData.secondPaidMethod === "Efectivo") {
              await tx.cashMovement.create({
                data: {
                  total: totalSecondMethodEdit,
                  seller: updatedData.seller,
                  paidMethod: updatedData.secondPaidMethod || "Efectivo",
                  businessId,
                  cashboxSessionId: activeSession.id,
                  orderId,
                  date: new Date(),
                },
              });
            }
          } else if (updatedData.paidMethod === "Efectivo") {
            await tx.cashMovement.create({
              data: {
                total: totalEdit,
                seller: updatedData.seller,
                paidMethod: updatedData.paidMethod || "Efectivo",
                businessId,
                cashboxSessionId: activeSession.id,
                orderId,
                date: new Date(),
              },
            });
          }
        }
      }

      return { success: true };
    }, { maxWait: 10000, timeout: 60000 });

    // ⏰ Respuesta inmediata — non-critical en background
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

    return result;
  } catch (error) {
    console.error("Error updating sale:", error);
    // Preserve specific CAE guard message instead of generic error
    if (error instanceof Error && error.message.includes("ya fue facturada")) {
      return { success: false as const, error: error.message };
    }
    return fail("Error al actualizar la venta");
  }
};
