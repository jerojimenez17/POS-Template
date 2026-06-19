"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { pusherServer } from "@/lib/pusher-server";
import { fail } from "@/lib/action-result";
import { OrderUpdateChanges } from "@/models/OrderUpdateChanges";
import { OrderSnapshot } from "@/models/OrderSnapshot";

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

  try {
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
        include: { items: true },
      });

      for (const item of billState.products) {
        await tx.product.update({
          where: { id: item.id },
          data: { amount: { decrement: item.amount } },
        });

        await tx.stockMovement.create({
          data: {
            type: "SALE",
            quantity: -item.amount,
            productId: item.id,
            orderId: order.id,
            businessId: businessId,
            reason: `Venta #${order.id}`,
          },
        });

        await tx.productRanking.upsert({
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
        });
      }

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
    });

    await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

    for (const movement of result.movements) {
      await pusherServer.trigger(`movements-${businessId}`, "new-movement", movement);
    }

    revalidateTag(CACHE_TAGS.STOCK, "max");
    revalidateTag(CACHE_TAGS.CASHBOX, "max");
    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.SALES, "max");
    revalidateTag(CACHE_TAGS.SALES, "max");
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

  try {
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

      for (const item of data.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { amount: { increment: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            type: "RETURN",
            quantity: item.quantity,
            productId: item.productId,
            businessId,
            reason: `Devolución #${returnRecord.id} (Ref: Venta #${data.orderId})`,
          },
        });

        const orderItem = await tx.orderItem.findFirst({
          where: { 
            orderId: data.orderId, 
            productId: item.productId 
          }
        });

        if (!orderItem) throw new Error("OrderItem not found");

        await tx.saleReturnItem.create({
          data: {
            returnId: returnRecord.id,
            orderItemId: orderItem.id,
            productId: item.productId,
            quantity: item.quantity,
            refundAmount: item.refundAmount,
          }
        });
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
    });

    await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
    revalidateTag(CACHE_TAGS.STOCK, "max");
    revalidateTag(CACHE_TAGS.CASHBOX, "max");
    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.SALES, "max");
    revalidateTag(CACHE_TAGS.SALES, "max");
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
  if (userRole !== "ADMIN")
    return { error: "Solo los administradores pueden editar ventas" };

  try {
    const result = await db.$transaction(async (tx) => {
      const existingOrder = await tx.order.findFirst({
        where: { id: orderId, businessId },
        include: { items: true },
      });

      if (!existingOrder) throw new Error("Orden no encontrada");

      // 🔹 calcular versión
      const lastUpdate = await tx.orderUpdate.findFirst({
        where: { orderId },
        orderBy: { version: "desc" },
      });

      const version = (lastUpdate?.version ?? 0) + 1;

      // 🔹 calcular cambios
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

      // 🔹 revertir stock anterior
      for (const item of existingOrder.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { amount: { increment: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              type: "ADJUSTMENT",
              quantity: item.quantity,
              productId: item.productId,
              orderId,
              businessId,
              reason: `Reversión por edición de Venta #${orderId}`,
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

      // 🔹 descontar stock nuevo
      for (const item of updatedData.products) {
        await tx.product.update({
          where: { id: item.id },
          data: { amount: { decrement: item.amount } },
        });

        await tx.stockMovement.create({
          data: {
            type: "SALE",
            quantity: -item.amount,
            productId: item.id,
            orderId,
            businessId,
            reason: `Actualización por edición de Venta #${orderId}`,
          },
        });
      }

      return { success: true };
    });

    await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

    revalidateTag(CACHE_TAGS.STOCK, "max");
    revalidateTag(CACHE_TAGS.CASHBOX, "max");
    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.SALES, "max");
    revalidateTag(CACHE_TAGS.SALES, "max");
    revalidateTag(CACHE_TAGS.SALES, "max");

    return result;
  } catch (error) {
    console.error("Error updating sale:", error);
    return fail("Error al actualizar la venta");
  }
};
