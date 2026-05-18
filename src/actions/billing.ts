"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidatePath } from "next/cache";

/**
 * Updates the business balance in the CashBox model.
 * If no CashBox exists for the business, it creates one.
 */
export const updateBusinessBalance = async (amount: number) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    // 1. Try to find active session for this user
    const activeSession = await db.cashboxSession.findFirst({
      where: { userId: session.user.id, status: "OPEN" },
    });

    if (activeSession) {
      await db.cashBox.update({
        where: { id: activeSession.cashboxId },
        data: { total: { increment: amount } },
      });
      return { success: true };
    }

    // 2. Fallback: Find the first cashbox for the business
    const existingCashBox = await db.cashBox.findFirst({
      where: { businessId: session.user.businessId },
    });

    if (existingCashBox) {
      await db.cashBox.update({
        where: { id: existingCashBox.id },
        data: { total: { increment: amount } },
      });
    } else {
      await db.cashBox.create({
        data: {
          businessId: session.user.businessId,
          total: amount,
          name: "Caja Principal",
        },
      });
    }
    return { success: true };
  } catch (error) {
    console.error("Error updating business balance:", error);
    return { error: "Error al actualizar el total de caja" };
  }
};

/**
 * Updates stock amounts for multiple products.
 */
export const updateProductsStock = async (items: { id: string; amount: number }[]) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    // Perform updates in a transaction for atomicity
    await db.$transaction(
      items.map((item) =>
        db.product.update({
          where: { id: item.id },
          data: { amount: { decrement: item.amount } },
        })
      )
    );
    revalidatePath("/stock");
    return { success: true };
  } catch (error) {
    console.error("Error updating products stock:", error);
    return { error: "Error al actualizar stock de productos" };
  }
};

/**
 * Updates the monthly ranking for sold products.
 */
export const updateMonthlyRankingAction = async (items: { id: string; amount: number; salePrice: number }[]) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();

  try {
    await db.$transaction(
      items.map((item) =>
        db.productRanking.upsert({
          where: {
            productId_month_year_businessId: {
              productId: item.id,
              month,
              year,
              businessId: session.user.businessId!,
            },
          },
          update: {
            totalSold: { increment: item.amount },
            totalIncome: { increment: item.amount * item.salePrice },
          },
          create: {
            productId: item.id,
            month,
            year,
            businessId: session.user.businessId!,
            totalSold: item.amount,
            totalIncome: item.amount * item.salePrice,
          },
        })
      )
    );
    return { success: true };
  } catch (error) {
    console.error("Error updating monthly ranking:", error);
    return { error: "Error al actualizar ranking mensual" };
  }
};

/**
 * Interface representing the expected input for saveOrderAction
 */
interface SavedProduct {
  id: string;
  code: string;
  description: string;
  price: number;
  amount: number;
}

interface BillStateInput {
  total: number;
  totalWithDiscount?: number;
  seller: string;
  paidMethod: string;
  products: SavedProduct[];
}

/**
 * Saves a sale as an Order and OrderItems in Prisma.
 */
export const saveOrderAction = async (billState: BillStateInput) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    const order = await db.order.create({
      data: {
        total: billState.totalWithDiscount || billState.total,
        seller: billState.seller,
        status: "confirmado",
        paidStatus: billState.paidMethod === "Efectivo" ? "pago" : "inpago",
        business: { connect: { id: session.user.businessId } },
        client: undefined, // client is optional now in schema
        items: {
          create: billState.products.map((p) => ({
            productId: p.id,
            code: p.code,
            description: p.description,
            price: p.price,
            quantity: p.amount,
            subTotal: p.price * p.amount,
          })),
        },
      },
    });
    return { success: true, orderId: order.id };
  } catch (error) {
    console.error("Error saving order:", error);
    return { error: "Error al guardar la venta" };
  }
};

/**
 * Fetches the business balance by aggregating from cashMovements.
 */
export const getBusinessBalanceAction = async () => {
  const session = await auth();
  if (!session?.user?.businessId) return 0;

  try {
    const result = await db.cashMovement.aggregate({
      where: { businessId: session.user.businessId },
      _sum: { total: true },
    });
    return result._sum.total || 0;
  } catch (error) {
    console.error("Error fetching business balance:", error);
    return 0;
  }
};
