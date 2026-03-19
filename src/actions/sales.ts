"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidatePath } from "next/cache";
import BillState from "@/models/BillState";

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
    const totalSecondMethodParsed = Number(billState.totalSecondMethod) || 0;

    const total = billState.totalWithDiscount || billState.total;
    const discountAmount = billState.total * discountPercent * 0.01;
    
    const result = await db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          total: total,
          seller: billState.seller,
          status: "confirmado",
          paidStatus: "pago",
          paymentMethod: billState.paidMethod || "Efectivo",
          paymentMethod2: billState.secondPaidMethod,
          totalMethod2: totalSecondMethodParsed,
          discountPercentage: discountPercent,
          discountAmount: discountAmount,
          businessId: businessId,
          clientId: billState.clientId,
          clientIvaCondition: billState.clientIvaCondition,
          clientDocumentNumber: billState.clientDocumentNumber,
          CAE: billState.CAE,
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
      if (billState.secondPaidMethod === "Efectivo") {
        cashToIncrement += totalSecondMethodParsed;
      }

      if (cashToIncrement > 0) {
        await tx.cashBox.upsert({
          where: { businessId },
          update: { total: { increment: cashToIncrement } },
          create: { businessId, total: cashToIncrement },
        });
      }

      await tx.cashMovement.create({
        data: {
          total: total,
          seller: billState.seller,
          paidMethod: billState.twoMethods 
            ? `${billState.paidMethod} + ${billState.secondPaidMethod}`
            : (billState.paidMethod || "Efectivo"),
          businessId: businessId,
          date: now,
        },
      });

      return order;
    });

    revalidatePath("/stock");
    revalidatePath("/cashRegister");
    return { success: true, orderId: result.id };
  } catch (error) {
    console.error("Error processing sale:", error);
    return { error: "Error al procesar la venta" };
  }
};

export const processReturnAction = async (data: { orderId: string; items: { productId: string; quantity: number; refundAmount: number }[]; reason: string }) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  try {
    const result = await db.$transaction(async (tx) => {
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
        where: { businessId },
        data: { total: { decrement: totalRefund } },
      });

      await tx.cashMovement.create({
        data: {
          total: -totalRefund,
          paidMethod: "Devolución",
          businessId,
          seller: session?.user?.email,
          date: new Date(),
        },
      });

      return returnRecord;
    });

    revalidatePath("/stock");
    revalidatePath("/cashRegister");
    return { success: true, returnId: result.id };
  } catch (error) {
    console.error("Error processing return:", error);
    return { error: "Error al procesar la devolución" };
  }
};

interface ReportOrder {
  total: number;
  discountAmount: number;
  paymentMethod: string | null;
  paymentMethod2: string | null;
  totalMethod2: number | null;
}

interface ReportReturn {
  total: number;
}

export const getDailyReportAction = async (startDate: Date, endDate?: Date) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = endDate ? new Date(endDate) : new Date(startDate);
  end.setHours(23, 59, 59, 999);

  try {
    const [orders, returns, stockMovements] = await Promise.all([
      db.order.findMany({
        where: { businessId, date: { gte: start, lte: end } },
        include: { items: true },
      }),
      db.saleReturn.findMany({
        where: { businessId, date: { gte: start, lte: end } },
        include: { items: true },
      }),
      db.stockMovement.findMany({
        where: { businessId, date: { gte: start, lte: end } },
        include: { product: true },
      }),
    ]);

    const totalSales = orders.reduce((acc: number, o: ReportOrder) => acc + o.total, 0);
    const totalDiscounts = orders.reduce((acc: number, o: ReportOrder) => acc + o.discountAmount, 0);
    const totalReturns = returns.reduce((acc: number, r: ReportReturn) => acc + r.total, 0);
    
    const paymentMethods: Record<string, number> = {};
    orders.forEach((o: ReportOrder) => {
      if (o.paymentMethod) {
        const amount1 = o.total - (o.totalMethod2 || 0);
        paymentMethods[o.paymentMethod] = (paymentMethods[o.paymentMethod] || 0) + amount1;
      }
      if (o.paymentMethod2 && (o.totalMethod2 || 0) > 0) {
        paymentMethods[o.paymentMethod2] = (paymentMethods[o.paymentMethod2] || 0) + (o.totalMethod2 || 0);
      }
    });

    return {
      success: true,
      data: {
        totalSales,
        totalDiscounts,
        totalReturns,
        netTotal: totalSales - totalReturns,
        orderCount: orders.length,
        returnCount: returns.length,
        paymentMethods,
        stockMovementCount: stockMovements.length,
      }
    };
  } catch (error) {
    console.error("Error fetching daily report:", error);
    return { error: "Error al generar el reporte" };
  }
};

export const getSalesAction = async (): Promise<BillState[]> => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return [];

  try {
    const orders = await db.order.findMany({
      where: { businessId },
      include: {
        items: true,
        client: true,
      },
      orderBy: { date: "desc" },
      take: 1100,
    });

    const parsedSales = orders.map((order) => {
      return {
        id: order.id,
        products: order.items.map((item) => ({
          id: item.productId || item.id,
          code: item.code || "",
          description: item.description || "",
          price: item.costPrice,
          salePrice: item.price,
          amount: item.quantity,
          unit: "unidades",
        })),
        total: order.total + order.discountAmount,
        totalWithDiscount: order.total,
        client: order.client?.name || undefined,
        clientId: order.clientId || undefined,
        seller: order.seller || "",
        discount: order.discountPercentage,
        date: order.date,
        typeDocument: order.clientIvaCondition || "DNI",
        documentNumber: order.clientDocumentNumber ? Number(order.clientDocumentNumber) : 0,
        secondPaidMethod: order.paymentMethod2 || undefined,
        totalSecondMethod: order.totalMethod2 || undefined,
        IVACondition: order.clientIvaCondition || "Consumidor Final",
        clientIvaCondition: order.clientIvaCondition || undefined,
        clientDocumentNumber: order.clientDocumentNumber || undefined,
        CAE: order.CAE ? (order.CAE as unknown as CAE) : undefined,
        twoMethods: !!order.paymentMethod2,
        paidMethod: order.paymentMethod || "Efectivo",
      };
    });

    return parsedSales as unknown as BillState[];
  } catch (error) {
    console.error("Error fetching sales:", error);
    return [];
  }
};

export const getSaleByIdAction = async (id: string): Promise<BillState | null> => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return null;

  try {
    const order = await db.order.findUnique({
      where: { id, businessId },
      include: {
        items: true,
        client: true,
      },
    });

    if (!order) return null;

    return {
      id: order.id,
      products: order.items.map((item) => ({
        id: item.productId || item.id,
        code: item.code || "",
        description: item.description || "",
        price: item.costPrice,
        salePrice: item.price,
        amount: item.quantity,
        unit: "unidades",
      })),
      total: order.total + order.discountAmount,
      totalWithDiscount: order.total,
      client: order.client?.name || undefined,
      clientId: order.clientId || undefined,
      seller: order.seller || "",
      discount: order.discountPercentage,
      date: order.date,
      typeDocument: order.clientIvaCondition || "DNI",
      documentNumber: order.clientDocumentNumber ? Number(order.clientDocumentNumber) : 0,
      secondPaidMethod: order.paymentMethod2 || undefined,
      totalSecondMethod: order.totalMethod2 || undefined,
      IVACondition: order.clientIvaCondition || "Consumidor Final",
      clientIvaCondition: order.clientIvaCondition || undefined,
      clientDocumentNumber: order.clientDocumentNumber || undefined,
      CAE: order.CAE ? (order.CAE as unknown as CAE) : undefined,
      twoMethods: !!order.paymentMethod2,
      paidMethod: order.paymentMethod || "Efectivo",
    } as unknown as BillState;
  } catch (error) {
    console.error("Error fetching sale:", error);
    return null;
  }
};

export const getUniqueSellersAction = async (): Promise<string[]> => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return [];

  try {
    const sellers = await db.order.findMany({
      where: { 
        businessId,
        seller: { not: null, notIn: [""] }
      },
      select: {
        seller: true,
      },
      distinct: ['seller'],
    });

    return sellers.map(s => s.seller as string);
  } catch (error) {
    console.error("Error fetching unique sellers:", error);
    return [];
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

      // 🔹 actualizar orden
      await tx.order.update({
        where: { id: orderId },
        data: {
          total,
          seller: updatedData.seller,
          paymentMethod: updatedData.paidMethod || "Efectivo",
          paymentMethod2: updatedData.secondPaidMethod,
          totalMethod2: Number(updatedData.totalSecondMethod) || 0,
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

    revalidatePath("/stock");
    revalidatePath("/cashRegister");
    revalidatePath(`/sales/${orderId}`);

    return result;
  } catch (error) {
    console.error("Error updating sale:", error);
    return { error: "Error al actualizar la venta" };
  }
};

export const getSaleHistoryAction = async (orderId: string) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return [];

  try {
    const updates = await db.orderUpdate.findMany({
      where: { orderId, order: { businessId } },
      include: {
        updatedBy: {
          select: { name: true, email: true }
        }
      },
      orderBy: { date: "desc" },
    });

    return updates;
  } catch (error) {
    console.error("Error fetching sale history:", error);
    return [];
  }
};
import { Prisma } from "@prisma/client";
import { OrderUpdateChanges } from "@/models/OrderUpdateChanges";
import { OrderSnapshot } from "@/models/OrderSnapshot";
import CAE from "@/models/CAE";

export type OrderUpdateWithUser = Prisma.OrderUpdateGetPayload<{
  include: {
    updatedBy: {
      select: {
        name: true;
        email: true;
      };
    };
  };
}>;
