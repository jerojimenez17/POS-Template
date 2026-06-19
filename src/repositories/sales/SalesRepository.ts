import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type BillState from "@/models/BillState";
import type CAE from "@/models/CAE";
import type {
  ISalesRepository,
  SalesFilters,
  PaginatedSales,
  SalesStats,
} from "../interfaces/ISalesRepository";

const BILL_SELECT = {
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
};

function buildWhereClause(
  businessId: string,
  filters?: SalesFilters
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    businessId,
    paidStatus: "pago",
  };

  if (filters?.startDate) {
    where.date = { gte: filters.startDate };
  }

  if (filters?.endDate) {
    where.date = {
      ...(where.date as object),
      lte: filters.endDate,
    };
  }

  if (filters?.seller) {
    where.seller = filters.seller;
  }

  if (filters?.paymentMethods?.length) {
    where.paymentMethod = { in: filters.paymentMethods };
  }

  return where;
}

function mapToBillState(order: {
  id: string;
  total: number;
  date: Date;
  seller: string | null;
  discountPercentage: number;
  discountAmount: number;
  paymentMethod: string | null;
  paymentMethod2: string | null;
  totalMethod2: number | null;
  clientId: string | null;
  client: { name: string | null } | null;
  items: {
    id: string;
    productId: string | null;
    code: string | null;
    description: string | null;
    costPrice: number;
    price: number;
    quantity: number;
  }[];
  clientIvaCondition: string | null;
  clientDocumentNumber: string | null;
  CAE: unknown;
}): BillState {
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
    documentNumber: order.clientDocumentNumber
      ? Number(order.clientDocumentNumber)
      : 0,
    secondPaidMethod: order.paymentMethod2 || undefined,
    totalSecondMethod: order.totalMethod2 || undefined,
    IVACondition: order.clientIvaCondition || "Consumidor Final",
    clientIvaCondition: order.clientIvaCondition || undefined,
    clientDocumentNumber: order.clientDocumentNumber || undefined,
    CAE: order.CAE as unknown as CAE | undefined,
    twoMethods:
      !!order.paymentMethod2 &&
      order.totalMethod2 !== null &&
      order.totalMethod2 > 0,
    paidMethod: order.paymentMethod || "Efetivo",
  } as BillState;
}

export class SalesRepository implements ISalesRepository {
  async getFilteredSales(
    businessId: string,
    cursor?: string,
    limit: number = 10,
    filters?: SalesFilters
  ): Promise<PaginatedSales> {
    const where = buildWhereClause(businessId, filters);

    // Run count and paginated query in parallel
    const [totalCount, orders] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({
        where,
        select: BILL_SELECT,
        orderBy: { date: "desc" },
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
      }),
    ]);

    const hasMore = orders.length > limit;
    const displayOrders = hasMore ? orders.slice(0, limit) : orders;
    const nextCursor = hasMore ? displayOrders[displayOrders.length - 1]?.id : null;

    const [stats, todayStats] = await Promise.all([
      this.getStats(businessId, filters),
      this.getTodayStats(businessId, filters),
    ]);

    return {
      sales: displayOrders.map(mapToBillState),
      nextCursor,
      hasMore,
      totalCount,
      stats: {
        ...stats,
        totalToday: todayStats.totalToday,
        todayCount: todayStats.todayCount,
      },
    };
  }

  async getStats(businessId: string, filters?: SalesFilters): Promise<SalesStats> {
    const where = buildWhereClause(businessId, filters);

    const result = await db.order.aggregate({
      where,
      _sum: { total: true },
      _count: true,
    });

    return {
      totalSales: result._sum.total ?? 0,
      totalToday: 0,
      todayCount: 0,
    };
  }

  async getTodayStats(
    businessId: string,
    filters?: SalesFilters
  ): Promise<Pick<SalesStats, "totalToday" | "todayCount">> {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );

    const where = buildWhereClause(businessId, filters);
    const dateFilter = where.date as Prisma.DateTimeFilter | undefined;
    where.date = { ...dateFilter, gte: todayStart } as Prisma.OrderWhereInput["date"];

    const result = await db.order.aggregate({
      where,
      _sum: { total: true },
      _count: true,
    });

    return {
      totalToday: result._sum.total ?? 0,
      todayCount: result._count ?? 0,
    };
  }
}

// Singleton instance
export const salesRepository = new SalesRepository();