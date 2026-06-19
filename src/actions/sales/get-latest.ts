"use server";

import { auth } from "../../../auth";
import { db } from "@/lib/db";
import type BillState from "@/models/BillState";
import type CAE from "@/models/CAE";

/**
 * Returns the latest sale order - used for real-time updates
 * Only fetches the most recent paid order
 */
export const getLatestSaleAction = async () => {
  const session = await auth();
  const businessId = session?.user?.businessId;

  if (!businessId) {
    return { 
      sale: null, 
      error: "No autorizado" 
    };
  }

  try {
    const latestOrder = await db.order.findFirst({
      where: {
        businessId,
        paidStatus: "pago",
      },
      select: {
        id: true,
        total: true,
        date: true,
        seller: true,
        discountPercentage: true,
        discountAmount: true,
        paymentMethod: true,
        paymentMethod2: true,
        totalMethod2: true,
        clientId: true,
        client: {
          select: { name: true },
        },
        items: {
          select: {
            id: true,
            productId: true,
            code: true,
            description: true,
            costPrice: true,
            price: true,
            quantity: true,
          },
        },
        clientIvaCondition: true,
        clientDocumentNumber: true,
        CAE: true,
      },
      orderBy: { date: "desc" },
      take: 1,
    });

    if (!latestOrder) {
      return { sale: null };
    }

    const sale = {
      id: latestOrder.id,
      products: latestOrder.items.map((item) => ({
        id: item.productId || item.id,
        code: item.code || "",
        description: item.description || "",
        price: item.costPrice,
        salePrice: item.price,
        amount: item.quantity,
        unit: "unidades",
      })),
      total: latestOrder.total + latestOrder.discountAmount,
      totalWithDiscount: latestOrder.total,
      client: latestOrder.client?.name || undefined,
      clientId: latestOrder.clientId || undefined,
      seller: latestOrder.seller || "",
      discount: latestOrder.discountPercentage,
      date: latestOrder.date,
      typeDocument: latestOrder.clientIvaCondition || "DNI",
      documentNumber: latestOrder.clientDocumentNumber
        ? Number(latestOrder.clientDocumentNumber)
        : 0,
      secondPaidMethod: latestOrder.paymentMethod2 || undefined,
      totalSecondMethod: latestOrder.totalMethod2 || undefined,
      IVACondition: latestOrder.clientIvaCondition || "Consumidor Final",
      clientIvaCondition: latestOrder.clientIvaCondition || undefined,
      clientDocumentNumber: latestOrder.clientDocumentNumber || undefined,
      CAE: latestOrder.CAE as unknown as CAE | undefined,
      twoMethods:
        !!latestOrder.paymentMethod2 &&
        latestOrder.totalMethod2 !== null &&
        latestOrder.totalMethod2 > 0,
      paidMethod: latestOrder.paymentMethod || "Efetivo",
    } as BillState;

    return { sale, total: latestOrder.total };
  } catch (error) {
    console.error("Error fetching latest sale:", error);
    return { 
      sale: null, 
      error: "Error al obtener la última venta" 
    };
  }
};