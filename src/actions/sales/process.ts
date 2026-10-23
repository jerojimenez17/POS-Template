"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { pusherServer } from "@/lib/pusher-server";
import { fail } from "@/lib/action-result";
import { after } from "next/server";
import { MovementType, Prisma } from "@prisma/client";
import { OrderUpdateChanges } from "@/models/OrderUpdateChanges";
import { OrderSnapshot } from "@/models/OrderSnapshot";
import { processInBatches, bulkUpdateStock } from "@/lib/batch-utils";
import { z } from "zod";
import { consumeAuthorizedFiscalSnapshotGrant } from "@/lib/server/fiscal-snapshot-grant";

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
  clientDocumentType?: "CUIT" | "DNI" | "";
  CAE?: {
    CAE: string;
    vencimiento: string;
    nroComprobante: number | string;
    qrData: string;
    ptoVenta?: number | string;
    fiscalSnapshotToken?: string;
  };
  billType?: string;
}

export const processSaleAction = async (billState: ProcessSaleInput) => {
  try {
    const clientDocumentType = billState.clientDocumentType;
    if (clientDocumentType !== undefined && clientDocumentType !== "" && clientDocumentType !== "CUIT" && clientDocumentType !== "DNI") {
      return { error: "Tipo de documento inválido" };
    }
    const clientDocumentNumber = billState.clientDocumentNumber && billState.clientDocumentNumber.trim()
      ? billState.clientDocumentNumber
      : null;
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
    const caeForPersistence = billState.CAE
      ? {
        CAE: billState.CAE.CAE,
        vencimiento: billState.CAE.vencimiento,
        nroComprobante: billState.CAE.nroComprobante,
        qrData: billState.CAE.qrData,
        ...(billState.CAE.ptoVenta === undefined ? {} : { ptoVenta: billState.CAE.ptoVenta }),
      }
      : undefined;
    
    const result = await db.$transaction(async (tx) => {
      const activeSession = await tx.cashboxSession.findFirst({
        where: { userId: session.user!.id, status: "OPEN" },
      });
      if (!activeSession) {
        throw new Error("No hay una sesión de caja abierta.");
      }

      let fiscalSnapshot;
      if (billState.CAE?.fiscalSnapshotToken) {
        const originalBillType = billState.billType;
        const invoiceNumber = Number(billState.CAE.nroComprobante);
        const pointOfSale = Number(billState.CAE.ptoVenta);
        if ((originalBillType !== "Factura A" && originalBillType !== "Factura B" && originalBillType !== "Factura C")
          || !Number.isSafeInteger(invoiceNumber) || invoiceNumber <= 0
          || !Number.isSafeInteger(pointOfSale) || pointOfSale <= 0) {
          throw new Error("Los datos de autorización fiscal no coinciden con la venta");
        }
        fiscalSnapshot = await consumeAuthorizedFiscalSnapshotGrant(tx, {
          token: billState.CAE.fiscalSnapshotToken,
          businessId,
          cae: billState.CAE.CAE,
          billType: originalBillType,
          invoiceNumber,
          pointOfSale,
          total,
        });
      }
      if (billState.CAE?.fiscalSnapshotToken && !fiscalSnapshot) {
        throw new Error("La autorización fiscal de la factura expiró o no coincide con la venta");
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
          clientDocumentNumber,
          clientDocumentType: clientDocumentType || null,
          ...(caeForPersistence ? { CAE: caeForPersistence } : {}),
          billType: billState.billType,
          afipVoucherType: billState.CAE ? (billState.billType === "Factura A" ? 1 : billState.billType === "Factura B" ? 6 : billState.billType === "Factura C" ? 11 : null) : null,
          invoiceNumber: billState.CAE ? Number(billState.CAE.nroComprobante) : null,
          invoicePointOfSale: billState.CAE?.ptoVenta === undefined ? null : Number(billState.CAE.ptoVenta),
          invoiceIssuedAt: billState.CAE ? now : null,
          ...(fiscalSnapshot ? {
            fiscalSnapshot: JSON.parse(JSON.stringify(fiscalSnapshot)) as Prisma.InputJsonValue,
          } : {}),
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
    try {
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
    } catch (afterError: unknown) {
      console.error("Could not schedule non-critical sale background work", {
        errorType: afterError instanceof Error ? afterError.name : typeof afterError,
      });
    }

    return { success: true, orderId: result.order.id };
  } catch (error) {
    console.error("Error processing sale:", error);
    return fail("Error al procesar la venta");
  }
};

const returnInputSchema = z.object({
  orderId: z.string().min(1),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().finite().positive(),
    refundAmount: z.number().finite().nonnegative(),
  }).strict()).min(1),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const processReturnAction = async (data: unknown) => {
  try {
    const session = await auth();
    const businessId = session?.user?.businessId;
    const userId = session?.user?.id;
    if (!businessId || !userId) return { error: "No autorizado" };
    const parsed = returnInputSchema.safeParse(data);
    if (!parsed.success) return { error: "Datos de devolución inválidos" };
    const returnData = parsed.data;
    const result = await db.$transaction(async (tx) => {
      // Serialize manual returns against credit-note reservations on the same
      // tenant-scoped Order row. The lock is held through transaction commit.
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Order" WHERE "id" = ${returnData.orderId} AND "businessId" = ${businessId} FOR UPDATE`;

      // Re-read after acquiring the lock; the pre-lock snapshot is not a
      // concurrency authority for return state.
      const order = await tx.order.findFirst({
        where: { id: returnData.orderId, businessId },
        include: { items: true, returns: { include: { items: true } } },
      });
      if (!order) throw new Error("Venta no encontrada");
      if (order.returns.some((item) => item.kind === "CREDIT_NOTE"
        && (item.status === "PENDING" || item.status === "AUTHORIZED"))) {
        throw new Error("La venta tiene una Nota de Crédito pendiente o autorizada");
      }

      const requestedProductIds = new Set<string>();
      for (const item of returnData.items) {
        if (requestedProductIds.has(item.productId)) {
          throw new Error("No se puede repetir un producto en la devolución");
        }
        requestedProductIds.add(item.productId);
      }

      const orderItems = order.items.filter((item) => item.productId !== null);
      const orderItemByProduct = new Map(orderItems.map((item) => [item.productId as string, item]));
      const returnedByOrderItem = new Map<string, { quantity: number; refundAmount: number }>();
      for (const previousReturn of order.returns) {
        if (previousReturn.status === "REJECTED") continue;
        for (const previousItem of previousReturn.items) {
          const current = returnedByOrderItem.get(previousItem.orderItemId) ?? { quantity: 0, refundAmount: 0 };
          current.quantity += previousItem.quantity;
          current.refundAmount += previousItem.refundAmount;
          returnedByOrderItem.set(previousItem.orderItemId, current);
        }
      }

      let totalRefund = 0;
      for (const item of returnData.items) {
        const orderItem = orderItemByProduct.get(item.productId);
        if (!orderItem) throw new Error("El producto no pertenece a la venta");
        const previous = returnedByOrderItem.get(orderItem.id) ?? { quantity: 0, refundAmount: 0 };
        const availableQuantity = orderItem.quantity - previous.quantity;
        const originalRefund = orderItem.subTotal > 0 ? orderItem.subTotal : orderItem.price * orderItem.quantity;
        const availableRefund = originalRefund - previous.refundAmount;
        const refundForRequestedQuantity = orderItem.quantity > 0
          ? (originalRefund / orderItem.quantity) * item.quantity
          : 0;
        if (item.quantity > availableQuantity + Number.EPSILON) {
          throw new Error("La cantidad supera la cantidad disponible para devolver");
        }
        if (item.refundAmount > Math.min(availableRefund, refundForRequestedQuantity) + Number.EPSILON) {
          throw new Error("El reintegro supera el importe disponible para devolver");
        }
        totalRefund += item.refundAmount;
      }
      if (totalRefund <= 0) throw new Error("El importe de devolución debe ser mayor a 0");

      const authorizedCreditNote = order.returns.some((item) => item.kind === "CREDIT_NOTE" && item.status === "AUTHORIZED");
      const isFullOrderReturn = orderItems.length > 0 && orderItems.every((orderItem) => {
        const requested = returnData.items.find((item) => item.productId === orderItem.productId);
        const previous = returnedByOrderItem.get(orderItem.id) ?? { quantity: 0, refundAmount: 0 };
        return requested !== undefined && requested.quantity + previous.quantity >= orderItem.quantity - Number.EPSILON;
      });
      if (authorizedCreditNote && isFullOrderReturn) {
        throw new Error("La venta ya tiene una Nota de Crédito autorizada");
      }

      const activeSession = await tx.cashboxSession.findFirst({
        where: { userId, businessId, status: "OPEN" },
      });
      if (!activeSession) {
        throw new Error("No hay una sesión de caja abierta.");
      }

      const returnRecord = await tx.saleReturn.create({
        data: {
          orderId: returnData.orderId,
          businessId,
          reason: returnData.reason,
          kind: "MANUAL_RETURN",
          total: totalRefund,
        },
      });
      const orderItemMap = new Map(orderItems.map((oi) => [oi.productId, oi.id]));

      // 🚀 FASE 1+2: Bulk UPDATE (raw SQL) + Bulk INSERT (createMany)
      // Antes: 3 ops × N productos = 3N queries
      // Ahora: 1 bulk UPDATE + 2× createMany = 3 queries total
      {
        const stockMovements: { type: MovementType; quantity: number; productId: string; businessId: string; reason: string }[] = [];
        const returnItems: { returnId: string; orderItemId: string; productId: string; quantity: number; refundAmount: number }[] = [];

        for (const item of returnData.items) {
          const orderItemId = orderItemMap.get(item.productId);
          if (!orderItemId) throw new Error(`OrderItem not found for product ${item.productId}`);

          stockMovements.push({
            type: "RETURN",
            quantity: item.quantity,
            productId: item.productId,
            businessId,
            reason: `Devolución #${returnRecord.id} (Ref: Venta #${returnData.orderId})`,
          });
          returnItems.push({
            returnId: returnRecord.id,
            orderItemId,
            productId: item.productId,
            quantity: item.quantity,
            refundAmount: item.refundAmount,
          });
        }

        await bulkUpdateStock(tx, returnData.items.map(i => ({ id: i.productId, change: i.quantity })));
        await tx.stockMovement.createMany({ data: stockMovements });
        await tx.saleReturnItem.createMany({ data: returnItems });
      }

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

      // 🚀 FASE 1+2: revertir stock anterior (bulk UPDATE + createMany)
      {
        const revertItems = existingOrder.items.filter((item) => item.productId);
        const stockMovementsRevert: { type: MovementType; quantity: number; productId: string; orderId: string; businessId: string; reason: string }[] = [];
        for (const item of revertItems) {
          stockMovementsRevert.push({
            type: "ADJUSTMENT",
            quantity: item.quantity,
            productId: item.productId!,
            orderId,
            businessId,
            reason: `Reversión por edición de Venta #${orderId}`,
          });
        }
        await bulkUpdateStock(tx, revertItems.map(i => ({ id: i.productId!, change: i.quantity })));
        await tx.stockMovement.createMany({ data: stockMovementsRevert });
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

      // 🚀 FASE 1+2: descontar stock nuevo (bulk UPDATE + createMany)
      {
        const stockMovementsApply: { type: MovementType; quantity: number; productId: string; orderId: string; businessId: string; reason: string }[] = [];
        for (const item of updatedData.products) {
          stockMovementsApply.push({
            type: "SALE",
            quantity: -item.amount,
            productId: item.id,
            orderId,
            businessId,
            reason: `Actualización por edición de Venta #${orderId}`,
          });
        }
        await bulkUpdateStock(tx, updatedData.products.map(p => ({ id: p.id, change: -p.amount })));
        await tx.stockMovement.createMany({ data: stockMovementsApply });
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
    return fail("Error al actualizar la venta");
  }
};
