"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

interface LedgerProductInput {
  id: string;
  code: string;
  description: string;
  price: number;
  salePrice: number;
  amount: number;
}

interface CreateLedgerInput {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  products: LedgerProductInput[];
}

interface LedgerAccount {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  productsAccount: {
    id: string;
    code: string;
    description: string;
    price: number;
    salePrice: number;
    amount: number;
    date: Date;
  }[];
  total: number;
  date: Date;
  last_update: Date;
  status: string;
}

export const createLedgerAccountAction = async (input: CreateLedgerInput) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  try {
    const result = await db.$transaction(async (tx) => {
      // Find or create client
      let client = await tx.client.findFirst({
        where: {
          businessId,
          name: input.clientName,
        },
      });

      if (!client) {
        client = await tx.client.create({
          data: {
            name: input.clientName,
            email: input.clientEmail,
            cellPhone: input.clientPhone,
            businessId,
          },
        });
      }

      // Create order with consignacion status
      const total = input.products.reduce(
        (acc, p) => acc + p.salePrice * p.amount,
        0
      );

      const order = await tx.order.create({
        data: {
          total,
          seller: session.user!.email || "",
          status: "consignacion",
          paidStatus: "inpago",
          clientId: client.id,
          businessId,
          items: {
            create: input.products.map((p) => ({
              productId: p.id,
              code: p.code,
              description: p.description,
              costPrice: p.price,
              price: p.salePrice,
              quantity: p.amount,
              subTotal: p.salePrice * p.amount,
            })),
          },
        },
        include: { items: true, client: true },
      });

      // Discount stock and update rankings
      for (const item of input.products) {
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
            businessId,
            reason: `Venta a cuenta corriente: ${input.clientName}`,
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
            totalIncome: { increment: item.amount * item.salePrice },
          },
          create: {
            productId: item.id,
            month,
            year,
            businessId,
            totalSold: item.amount,
            totalIncome: item.amount * item.salePrice,
          },
        });
      }

      return order;
    });

    revalidateTag(CACHE_TAGS.STOCK, "max");
    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.CLIENTS, "max");
    return { success: true, orderId: result.id };
  } catch (error) {
    console.error("Error creating ledger account:", error);
    return { error: "Error al crear cuenta corriente" };
  }
};

export const getLedgerAccountsAction = async (): Promise<LedgerAccount[]> => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return [];

  try {
    const orders = await db.order.findMany({
      where: {
        businessId,
        status: "consignacion",
      },
      include: {
        items: true,
        client: true,
      },
      orderBy: { date: "desc" },
    });

    return orders.map((order) => ({
      id: order.id,
      clientName: order.client?.name || "Sin nombre",
      clientEmail: order.client?.email || "",
      clientPhone: order.client?.cellPhone || "",
      productsAccount: order.items.map((item) => ({
        id: item.productId || item.id,
        code: item.code || "",
        description: item.description || "",
        price: item.costPrice,
        salePrice: item.price,
        amount: item.quantity,
        date: item.addedAt,
      })),
      total: order.total,
      date: order.date,
      last_update: order.date,
      status: order.paidStatus,
    }));
  } catch (error) {
    console.error("Error fetching ledger accounts:", error);
    return [];
  }
};

export const addProductsToLedgerAction = async (
  orderId: string,
  products: LedgerProductInput[]
) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  try {
    await db.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, businessId },
      });

      if (!order) throw new Error("Orden no encontrada");

      const additionalTotal = products.reduce(
        (acc, p) => acc + p.salePrice * p.amount,
        0
      );

      await tx.order.update({
        where: { id: orderId },
        data: {
          total: { increment: additionalTotal },
        },
      });

      for (const item of products) {
        await tx.orderItem.create({
          data: {
            orderId,
            productId: item.id,
            code: item.code,
            description: item.description,
            costPrice: item.price,
            price: item.salePrice,
            quantity: item.amount,
            subTotal: item.salePrice * item.amount,
          },
        });

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
            totalIncome: { increment: item.amount * item.salePrice },
          },
          create: {
            productId: item.id,
            month,
            year,
            businessId,
            totalSold: item.amount,
            totalIncome: item.amount * item.salePrice,
          },
        });
      }
    });

    revalidateTag(CACHE_TAGS.STOCK, "max");
    revalidateTag(CACHE_TAGS.ORDERS, "max");
    return { success: true };
  } catch (error) {
    console.error("Error adding products to ledger:", error);
    return { error: "Error al añadir productos a la cuenta" };
  }
};
