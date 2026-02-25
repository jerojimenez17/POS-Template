"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidatePath } from "next/cache";
import BillState from "@/models/BillState";

/**
 * Atomic transaction to process a sale.
 * Includes Order creation, StockMovement logging, Product stock update, 
 * CashBox update, CashMovement recording, and Ranking update.
 */
export const processSaleAction = async (billState: any) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const total = billState.totalWithDiscount || billState.total;
    const discountAmount = billState.total * (billState.discount || 0) * 0.01;
    
    const result = await db.$transaction(async (tx) => {
      // 1. Create Order
      const order = await tx.order.create({
        data: {
          total: total,
          seller: billState.seller,
          status: "confirmado",
          paidStatus: "pago", // Defaulting as confirmed/paid for this flow
          paymentMethod: billState.paidMethod || "Efectivo",
          paymentMethod2: billState.secondPaidMethod,
          totalMethod2: billState.totalSecondMethod || 0,
          discountPercentage: billState.discount || 0,
          discountAmount: discountAmount,
          businessId: businessId,
          clientId: billState.clientId, // Assuming clientId is in billState if available
          items: {
            create: billState.products.map((p: any) => ({
              productId: p.id,
              code: p.code,
              description: p.description,
              costPrice: p.price || 0, // Assuming p.price is cost if costPrice not explicit
              price: p.salePrice || p.price, // Using salePrice if available
              quantity: p.amount,
              subTotal: (p.salePrice || p.price) * p.amount,
            })),
          },
        },
        include: { items: true },
      });

      // 2. Update Stock and Log Movements
      for (const item of billState.products) {
        // Decrement product stock
        await tx.product.update({
          where: { id: item.id },
          data: { amount: { decrement: item.amount } },
        });

        // Log Stock Movement
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

        // 3. Update Monthly Ranking
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
            totalIncome: { increment: item.amount * (item.salePrice || item.price) },
          },
          create: {
            productId: item.id,
            month,
            year,
            businessId,
            totalSold: item.amount,
            totalIncome: item.amount * (item.salePrice || item.price),
          },
        });
      }

      // 4. Update CashBox (only for Cash payments)
      let cashToIncrement = 0;
      if (billState.paidMethod === "Efectivo") {
        cashToIncrement += (total - (billState.totalSecondMethod || 0));
      }
      if (billState.secondPaidMethod === "Efectivo") {
        cashToIncrement += (billState.totalSecondMethod || 0);
      }

      if (cashToIncrement > 0) {
        await tx.cashBox.upsert({
          where: { businessId },
          update: { total: { increment: cashToIncrement } },
          create: { businessId, total: cashToIncrement },
        });
      }

      // 5. Create Cash Movement record
      await tx.cashMovement.create({
        data: {
          total: total,
          seller: billState.seller,
          paidMethod: billState.twoMethods 
            ? `${billState.paidMethod} + ${billState.secondPaidMethod}`
            : billState.paidMethod,
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

/**
 * Atomic transaction to process a return.
 */
export const processReturnAction = async (data: { orderId: string; items: { productId: string; quantity: number; refundAmount: number }[]; reason: string }) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Create SaleReturn record
      const returnRecord = await tx.saleReturn.create({
        data: {
          orderId: data.orderId,
          businessId,
          reason: data.reason,
          total: data.items.reduce((acc, item) => acc + item.refundAmount, 0),
        },
      });

      for (const item of data.items) {
        // 2. Increment product stock
        await tx.product.update({
          where: { id: item.productId },
          data: { amount: { increment: item.quantity } },
        });

        // 3. Log Stock Movement
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
})

if (!orderItem) {
  throw new Error("OrderItem not found")
}

await tx.saleReturnItem.create({
  data: {
    returnId: returnRecord.id,
    orderItemId: orderItem.id, // 👈 SET DIRECTAMENTE EL FK
    productId: item.productId,
    quantity: item.quantity,
    refundAmount: item.refundAmount,
  }
})
      }

      // 5. Update CashBox (Decrement)
      const totalRefund = data.items.reduce((acc, item) => acc + item.refundAmount, 0);
      await tx.cashBox.update({
        where: { businessId },
        data: { total: { decrement: totalRefund } },
      });

      // 6. Create Cash Movement for refund
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

/**
 * Fetches a report for a specific date range.
 */
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

    // Aggregate data
    const totalSales = orders.reduce((acc: number, o: any) => acc + o.total, 0);
    const totalDiscounts = orders.reduce((acc: number, o: any) => acc + o.discountAmount, 0);
    const totalReturns = returns.reduce((acc: number, r: any) => acc + r.total, 0);
    
    const paymentMethods: Record<string, number> = {};
    orders.forEach((o: any) => {
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

/**
 * Fetches sales (orders) for the current business.
 */
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
      orderBy: {
        date: "desc",
      },
      take: 1100, // Matching PAGE_SIZE from firebaseService
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
        })),
        total: order.total + order.discountAmount, // Base total before discount
        totalWithDiscount: order.total, // Final total after discount
        client: order.client?.name || undefined,
        clientId: order.clientId || undefined,
        seller: order.seller || "",
        discount: order.discountPercentage,
        date: order.date,
        typeDocument: "DNI",
        documentNumber: 0,
        secondPaidMethod: order.paymentMethod2 || undefined,
        totalSecondMethod: order.totalMethod2 || undefined,
        IVACondition: "Consumidor Final",
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

/**
 * Fetches unique sellers from the user's business sales.
 * Optimization: Avoids downloading all sales just to extract seller names.
 */
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
