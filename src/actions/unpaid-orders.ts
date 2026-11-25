"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { PaidStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { pusherServer } from "@/lib/pusher-server";
import { requireFeature, assertWritePermission } from "@/lib/auth-gates";

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

interface UnpaidOrderItem {
  productId: string;
  code?: string;
  description?: string;
  costPrice?: number;
  price: number;
  quantity: number;
  subTotal: number;
}

interface CreateUnpaidOrderInput {
  clientId: string;
  businessId: string;
  items: UnpaidOrderItem[];
  total: number;
  discount?: number;
  seller?: string;
  clientIvaCondition?: string;
  clientDocumentNumber?: string;
  notes?: string;
}

interface RegisterPaymentInput {
  orderId: string;
  amount: number;
  paymentMethod: string;
  businessId: string;
}

interface CancelUnpaidOrderInput {
  orderId: string;
  businessId: string;
}

interface UpdateOrderDiscountInput {
  orderId: string;
  discountPercentage: number;
  businessId: string;
}

export type LedgerStatus = "all" | "inpago" | "pago" | "pagado" | "pendiente" | "cancelado";

/** The business in the request is only a legacy consistency check, never an
 * authorization source. Server actions are public endpoints. */
const getAuthorizedBusinessId = async (requestedBusinessId?: string): Promise<string | null> => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId || (requestedBusinessId && requestedBusinessId !== businessId)) return null;
  return businessId;
};

export interface AccountLedgerOrder {
  id: string;
  date: Date;
  total: number;
  status: string;
  paidStatus: string;
  clientId: string | null;
  client: { id: string; name: string | null; balance: number } | null;
  notes: string | null;
}

export interface AccountLedgerPage {
  orders: AccountLedgerOrder[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface GetUnpaidOrdersInput {
  businessId: string;
  status?: LedgerStatus | string;
  orderId?: string;
  search?: string;
  limit?: number;
  cursor?: string | null;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

interface LedgerCursor {
  // PostgreSQL sorts NULL after every value for ASC. Keep NULL distinct from
  // the empty string: they are adjacent in the display, but not the same key.
  clientName: string | null;
  date: string;
  id: string;
  status: string;
  search: string;
}

const encodeCursor = (cursor: LedgerCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeCursor = (value: string | null | undefined, status: string, search: string): LedgerCursor | null => {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Partial<LedgerCursor>;
    if (candidate.status !== status || candidate.search !== search ||
        (candidate.clientName !== null && typeof candidate.clientName !== "string") ||
        typeof candidate.date !== "string" || Number.isNaN(Date.parse(candidate.date)) ||
        typeof candidate.id !== "string" || candidate.id.length === 0) return null;
    return candidate as LedgerCursor;
  } catch {
    return null;
  }
};

const addItemsToOrderSchema = z.object({
  orderId: z.string(),
  businessId: z.string(),
  items: z.array(
    z.object({
      productId: z.string(),
      code: z.string().optional(),
      description: z.string().optional(),
      costPrice: z.number().optional(),
      price: z.number(),
      quantity: z.number(),
      subTotal: z.number(),
    })
  ),
});

const updateOrderItemSchema = z.object({
  itemId: z.string(),
  orderId: z.string(),
  quantity: z.number().min(0.01).optional(),
  price: z.number().min(0).optional(),
});

const removeOrderItemSchema = z.object({
  itemId: z.string(),
  orderId: z.string(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getClientUnpaidOrderSchema = z.object({
  clientId: z.string(),
  businessId: z.string(),
});

const updateOrderDiscountSchema = z.object({
  orderId: z.string().min(1),
  discountPercentage: z.number().min(0).max(100),
  businessId: z.string().min(1),
});

export const createUnpaidOrder = async (input: CreateUnpaidOrderInput): Promise<ActionResult> => {
  try {
    const featureResult = await requireFeature("hasClientLedger");
    if (!featureResult.success) return { success: false, error: featureResult.error };
    const session = await auth();
    const businessId = session?.user?.businessId;
    if (input.businessId && input.businessId !== businessId) return { success: false, error: "No autorizado" };
    if (!businessId) return { success: false, error: "No autorizado" };

    const result = await db.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: input.clientId },
      });
      if (!client) throw new Error("Cliente no encontrado");
      if (client.businessId && client.businessId !== businessId) throw new Error("Cliente no encontrado");

      const productIds = input.items.map(i => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, businessId },
        select: { id: true, amount: true },
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      for (const item of input.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error(`Producto ${item.description || item.productId} no encontrado`);
        }
        if (product.amount < item.quantity) {
          throw new Error(`Stock insuficiente para ${item.description || item.productId}`);
        }
      }

      const order = await tx.order.create({
        data: {
          clientId: input.clientId,
          businessId,
          total: input.total,
          status: "confirmado",
          paidStatus: "inpago",
          date: new Date(),
          notes: input.notes || null,
          clientIvaCondition: input.clientIvaCondition,
          clientDocumentNumber: input.clientDocumentNumber,
          discountPercentage: Number(input.discount) || 0,
          discountAmount: Math.round(input.total * (Number(input.discount) || 0) * 0.01),
          seller: input.seller || null,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              code: item.code,
              description: item.description,
              costPrice: item.costPrice || 0,
              price: item.price,
              quantity: item.quantity,
              subTotal: item.subTotal,
              addedAt: new Date(),
            })),
          },
        },
        include: { items: true },
      });

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      for (const item of input.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { amount: { decrement: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            type: "SALE",
            quantity: -item.quantity,
            productId: item.productId,
            orderId: order.id,
            businessId,
          },
        });

        await tx.productRanking.upsert({
          where: {
            productId_month_year_businessId: {
              productId: item.productId,
              month,
              year,
              businessId,
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
            businessId,
            totalSold: item.quantity,
            totalIncome: item.quantity * item.price,
          },
        });
      }

      await tx.client.update({
        where: { id: input.clientId },
        data: { balance: { increment: input.total } },
      });

      return { success: true, data: order };
    });

    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.STOCK, "max");
    revalidateTag(CACHE_TAGS.CLIENTS, "max");
    await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

    return result;
  } catch (error) {
    console.error("Error creating unpaid order:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al crear la orden",
    };
  }
};

export const registerPayment = async (input: RegisterPaymentInput): Promise<ActionResult> => {
  try {
    const businessId = await getAuthorizedBusinessId(input.businessId);
    if (!businessId) return { success: false, error: "No autorizado" };

    const permission = await assertWritePermission();
    if (!permission.success) return { success: false, error: permission.error, code: permission.code };

    const movement = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { client: true, cashMovements: true },
      });
      if (!order) throw new Error("Orden no encontrada");
      if (order.businessId && order.businessId !== businessId) throw new Error("Orden no encontrada");

      const totalPaidBefore = order.cashMovements.reduce(
        (sum, cm) => sum + cm.total,
        0
      );

      // Round to integers to handle legacy decimal totals that prevent payment completion
      const roundedTotal = Math.round(order.total);
      const roundedPaidBefore = Math.round(totalPaidBefore);
      const roundedInput = Math.round(input.amount);
      if (roundedInput > roundedTotal - roundedPaidBefore) {
        throw new Error("El pago no puede exceder el saldo remaining");
      }
      const remainingBalance = roundedTotal - (roundedPaidBefore + roundedInput);

      const cashMovementData = {
        total: input.amount,
        paidMethod: input.paymentMethod,
        businessId,
        date: new Date(),
        orderId: input.orderId,
      };
      const newMovement = await tx.cashMovement.create({ data: cashMovementData } as never);

      if (order.clientId) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { decrement: input.amount } },
        });
      }

      const newPaidStatus: PaidStatus =
        remainingBalance <= 0 ? "pago" : "inpago";
      await tx.order.update({
        where: { id: input.orderId },
        data: { paidStatus: newPaidStatus },
      });

      return newMovement;
    });

    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.CLIENTS, "max");
    revalidateTag(CACHE_TAGS.CASHBOX, "max");
    await pusherServer.trigger(`movements-${businessId}`, "new-movement", movement);

    return { success: true };
  } catch (error) {
    console.error("Error registering payment:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al registrar el pago",
    };
  }
};

export const cancelUnpaidOrder = async (input: CancelUnpaidOrderInput): Promise<ActionResult> => {
  try {
    const businessId = await getAuthorizedBusinessId(input.businessId);
    if (!businessId) return { success: false, error: "No autorizado" };

    const permission = await assertWritePermission();
    if (!permission.success) return { success: false, error: permission.error, code: permission.code };

    const result = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { client: true, items: { include: { product: true } } },
      });
      if (!order) throw new Error("Orden no encontrada");
      if (order.businessId && order.businessId !== businessId) throw new Error("Orden no encontrada");

      if (order.paidStatus === "pago") {
        throw new Error("No se puede cancelar una orden ya pagado");
      }

      const productIds = [...new Set(order.items.flatMap((item) => item.productId ? [item.productId] : []))];
      const ownedProducts = await tx.product.findMany({
        where: { id: { in: productIds }, businessId },
        select: { id: true },
      });
      if (ownedProducts.length !== productIds.length) throw new Error("Producto no encontrado");

      for (const item of order.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { amount: { increment: item.quantity } },
          });

          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();

          await tx.productRanking.upsert({
            where: {
              productId_month_year_businessId: {
                productId: item.productId,
                month,
                year,
                businessId,
              },
            },
            update: { 
              totalSold: { decrement: item.quantity },
              totalIncome: { decrement: item.quantity * item.price }
            },
            create: {
              productId: item.productId,
              month,
              year,
              businessId,
              totalSold: 0,
              totalIncome: 0,
            },
          });
        }
      }

      if (order.clientId) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { decrement: order.total } },
        });
      }

      // Delete related records before deleting the order
      await tx.stockMovement.deleteMany({ where: { orderId: input.orderId, businessId } });
      await tx.cashMovement.deleteMany({ where: { orderId: input.orderId, businessId } });

      // Delete the order (cascades to OrderItem and OrderUpdate)
      await tx.order.delete({ where: { id: input.orderId } });

      return { success: true };
    });

    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.STOCK, "max");
    revalidateTag(CACHE_TAGS.CLIENTS, "max");
    await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

    return result;
  } catch (error) {
    console.error("Error canceling unpaid order:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al cancelar la orden",
    };
  }
};

export const updateOrderDiscount = async (input: UpdateOrderDiscountInput): Promise<ActionResult> => {
  try {
    const validatedInput = updateOrderDiscountSchema.parse(input);
    const businessId = await getAuthorizedBusinessId(validatedInput.businessId);
    if (!businessId) return { success: false, error: "No autorizado" };

    const result = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: validatedInput.orderId },
        include: { items: true, client: true },
      });

      if (!order) throw new Error("Orden no encontrada");
      if (order.businessId && order.businessId !== businessId) throw new Error("Orden no encontrada");
      if (order.paidStatus === "pago") throw new Error("No se puede modificar el descuento de una orden pagado");

      // Calculate subtotal from items (sum of all item subTotals)
      const subtotal = order.items.reduce((sum, item) => sum + item.subTotal, 0);

      // Calculate new discount amount and total
      const newDiscountAmount = Math.round(subtotal * validatedInput.discountPercentage * 0.01);
      const newTotal = subtotal - newDiscountAmount;

      // Calculate the difference to update client balance
      const totalDiff = newTotal - order.total;

      // Update order
      await tx.order.update({
        where: { id: validatedInput.orderId },
        data: {
          discountPercentage: validatedInput.discountPercentage,
          discountAmount: newDiscountAmount,
          total: newTotal,
        },
      });

      // Update client balance by the difference
      if (order.clientId && totalDiff !== 0) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { increment: totalDiff } },
        });
      }

      return { success: true, data: { newTotal, newDiscountAmount } };
    }, { maxWait: 10000, timeout: 60000 });

    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.CLIENTS, "max");

    return result;
  } catch (error) {
    console.error("Error updating order discount:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al actualizar el descuento",
    };
  }
};

export const getUnpaidOrders = async (input: GetUnpaidOrdersInput): Promise<ActionResult> => {
  try {
    const featureResult = await requireFeature("hasClientLedger");
    if (!featureResult.success) return { success: false, error: featureResult.error };

    const session = await auth();
    const businessId = session?.user?.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };

    if (input.orderId) {
      const order = await db.order.findUnique({
        where: { id: input.orderId, businessId },
        include: {
          client: true,
          cashMovements: true,
        },
      } as never);
      return { success: true, data: order ? [order] : [] };
    } else {
      const status = input.status || "inpago";
      // Older callers omitted every pagination field and consumed the raw
      // array. Keep that response shape while all explicit ledger requests
      // use the paginated envelope.
      const legacyArrayResponse = input.status === undefined &&
        input.limit === undefined && input.cursor === undefined;
      const isPending = status === "pendiente";
      const paidStatus = (status === "pagado" ? "pago" : status) as PaidStatus | undefined;
      const search = input.search?.trim() || "";
      const requestedLimit = input.limit ?? DEFAULT_PAGE_SIZE;
      const normalizedLimit = Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : DEFAULT_PAGE_SIZE;
      // These tabs are intentionally not client-configurable. In particular,
      // do not let a large (or small) limit turn the fixed-size tabs into an
      // unbounded/arbitrary batch API.
      const limit = isPending || status === "inpago"
        ? MAX_PAGE_SIZE
        : Math.min(Math.max(normalizedLimit, 1), MAX_PAGE_SIZE);
      const decodedCursor = decodeCursor(input.cursor, status, search);
      // An invalid cursor is an explicit first-page reset. Never manufacture a
      // boundary value: doing so can silently skip rows (especially null names).
      const invalidCursor = Boolean(input.cursor) && decodedCursor === null;
      const cursor = decodedCursor;
      const cursorDate = cursor ? new Date(cursor.date) : null;
      const continuation: Prisma.OrderWhereInput[] = cursor
        ? cursor.clientName === null
          ? [
              // ASC puts NULL after every non-NULL client name. Once the
              // cursor is in that bucket, only NULL names can follow it.
              { client: null, date: { lt: cursorDate as Date } },
              { client: null, date: cursorDate as Date, id: { gt: cursor.id } },
            ]
          : [
              // These branches are the lexicographic expansion of the exact
              // ORDER BY below: name ASC (NULLS LAST), date DESC, id ASC.
              // In particular, do not include NULL clients after an empty
              // name; PostgreSQL treats those as different sort keys.
              { client: { name: { gt: cursor.clientName } } },
              { client: { name: cursor.clientName }, date: { lt: cursorDate as Date } },
              { client: { name: cursor.clientName }, date: cursorDate as Date, id: { gt: cursor.id } },
            ]
        : invalidCursor
          // This redundant, true branch makes the reset explicit while keeping
          // the same predicate shape for callers inspecting the query.
          ? [{ businessId }]
          : [];
      const listOrders = await db.order.findMany({
        where: {
          businessId,
          // Si estamos buscando "pendientes", filtramos por status = pendiente
          ...(isPending ? { status: "pendiente" } : { status: { not: "pendiente" } }),
          // Y solo aplicamos el filtro de paidStatus si no es "pending" ni "all"
          ...(!isPending && paidStatus && paidStatus !== ("all" as never) ? { paidStatus } : {}),
          ...(search ? { client: { name: { contains: search, mode: "insensitive" as const } } } : {}),
          ...(continuation.length ? { OR: continuation } : {}),
        },
        select: {
          id: true,
          date: true,
          total: true,
          status: true,
          paidStatus: true,
          clientId: true,
          notes: true,
          client: { select: { id: true, name: true, balance: true } },
        },
        orderBy: [
          { client: { name: "asc" } },
          { date: "desc" },
          { id: "asc" },
        ],
        take: limit + 1,
      });
      const hasMore = listOrders.length > limit;
      const orders = (hasMore ? listOrders.slice(0, limit) : listOrders) as AccountLedgerOrder[];
      const last = orders[orders.length - 1];
      const nextCursor = hasMore && last
        ? encodeCursor({
            clientName: last.client ? last.client.name : null,
            date: last.date.toISOString(), id: last.id, status, search,
          })
        : null;
      if (legacyArrayResponse) return { success: true, data: orders };
      return { success: true, data: { orders, nextCursor, hasMore } };
    }
  } catch (error) {
    console.error("Error getting unpaid orders:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al obtener las órdenes",
    };
  }
};

export const getClientUnpaidOrders = async (clientId: string, legacyBusinessId?: string): Promise<ActionResult<{ id: string; total: number; date: Date; itemsCount: number; status: string; paidStatus: string }[]>> => {
  try {
    const businessId = await getAuthorizedBusinessId(legacyBusinessId);
    if (!businessId) return { success: false, error: "No autorizado" };

    const orders = await db.order.findMany({
      where: {
        clientId,
        businessId,
        paidStatus: "inpago",
        status: { in: ["pendiente", "confirmado", "consignacion"] },
      },
      include: {
        _count: { select: { items: true } },
      },
      orderBy: { date: "desc" },
    });

    return {
      success: true,
      data: orders.map(o => ({
        id: o.id,
        total: o.total,
        date: o.date,
        itemsCount: o._count.items,
        status: o.status,
        paidStatus: o.paidStatus,
      })),
    };
  } catch (error) {
    console.error("Error getting client unpaid orders:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al obtener las órdenes",
    };
  }
};

/** Legacy ClientSelectionModal contract; the optional businessId is only a
 * consistency check and is never an authorization source. */
export const getClientUnpaidOrder = async (clientId: string, legacyBusinessId?: string): Promise<ActionResult<unknown | null>> => {
  try {
    const businessId = await getAuthorizedBusinessId(legacyBusinessId);
    if (!businessId) return { success: false, error: "No autorizado" };

    const result = await db.$transaction(async (tx) => tx.order.findFirst({
      where: {
        clientId,
        businessId,
        paidStatus: "inpago",
        status: { in: ["pendiente", "confirmado", "consignacion"] },
      },
      include: { items: true },
      orderBy: { date: "desc" },
    }));
    const order = result && result.businessId && result.businessId !== businessId ? null : result;
    return { success: true, data: order };
  } catch (error) {
    console.error("Error getting client unpaid order:", error);
    return { success: false, error: error instanceof Error ? error.message : "Error al obtener la orden" };
  }
};

export const addItemsToOrder = async (input: z.infer<typeof addItemsToOrderSchema>): Promise<ActionResult> => {
  try {
    const validatedInput = addItemsToOrderSchema.parse(input);
    const businessId = await getAuthorizedBusinessId(validatedInput.businessId);
    if (!businessId) return { success: false, error: "No autorizado" };

    const permission = await assertWritePermission();
    if (!permission.success) return { success: false, error: permission.error, code: permission.code };

    return await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: validatedInput.orderId },
        include: { client: true, items: true },
      });

      if (!order) throw new Error("Orden no encontrada");
      if (order.businessId && order.businessId !== businessId) throw new Error("Orden no encontrada");
      if (order.paidStatus === "pago") throw new Error("No se puede modificar una orden pagado");

      for (const item of validatedInput.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, businessId },
        });
        if (!product) {
          throw new Error(`Producto ${item.description || item.productId} no encontrado`);
        }
        if (product.amount < item.quantity) {
          throw new Error(`Stock insuficiente para ${item.description || item.productId}`);
        }
      }

      const currentTimestamp = new Date();
      const month = currentTimestamp.getMonth() + 1;
      const year = currentTimestamp.getFullYear();

      for (const item of validatedInput.items) {
        await tx.orderItem.create({
          data: {
            orderId: validatedInput.orderId,
            productId: item.productId,
            code: item.code,
            description: item.description,
            costPrice: item.costPrice || 0,
            price: item.price,
            quantity: item.quantity,
            subTotal: item.subTotal,
            addedAt: currentTimestamp,
          },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: { amount: { decrement: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            type: "SALE",
            quantity: -item.quantity,
            productId: item.productId,
            orderId: order.id,
            businessId,
          },
        });

        await tx.productRanking.upsert({
          where: {
            productId_month_year_businessId: {
              productId: item.productId,
              month,
              year,
              businessId,
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
            businessId,
            totalSold: item.quantity,
            totalIncome: item.quantity * item.price,
          },
        });
      }

      const itemsTotal = validatedInput.items.reduce((sum, item) => sum + item.subTotal, 0);
      const newTotal = order.total + itemsTotal;

      await tx.order.update({
        where: { id: validatedInput.orderId },
        data: { total: newTotal },
      });

      if (order.clientId) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { increment: itemsTotal } },
        });
      }

      revalidateTag(CACHE_TAGS.ORDERS, "max");
      revalidateTag(CACHE_TAGS.STOCK, "max");
      revalidateTag(CACHE_TAGS.CLIENTS, "max");
      await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

      return { success: true };
    });
  } catch (error) {
    console.error("Error adding items to order:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al agregar items a la orden",
    };
  }
};

export const updateOrderItem = async (input: z.infer<typeof updateOrderItemSchema>): Promise<ActionResult> => {
  try {
    const validatedInput = updateOrderItemSchema.parse(input);
    const session = await auth();
    const businessId = session?.user?.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };

    const permission = await assertWritePermission();
    if (!permission.success) return { success: false, error: permission.error, code: permission.code };

    return await db.$transaction(async (tx) => {
      const orderItem = await tx.orderItem.findUnique({
        where: { id: validatedInput.itemId },
      });

      if (!orderItem) throw new Error("Item no encontrado");

      const order = await tx.order.findUnique({
        where: { id: validatedInput.orderId },
        include: { items: true },
      });

      if (!order) throw new Error("Orden no encontrada");
      if (order.businessId && order.businessId !== businessId) throw new Error("Orden no encontrada");
      if (orderItem.orderId !== order.id) throw new Error("Item no encontrado");
      if (order.paidStatus === "pago") throw new Error("No se puede modificar una orden pagado");

      const quantityDiff = validatedInput.quantity !== undefined 
        ? validatedInput.quantity - orderItem.quantity 
        : 0;

      if (quantityDiff > 0 && orderItem.productId) {
        const product = await tx.product.findFirst({
          where: { id: orderItem.productId, businessId },
        });
        if (!product || product.amount < quantityDiff) {
          throw new Error("Stock insuficiente");
        }
      }

      const newQuantity = validatedInput.quantity ?? orderItem.quantity;
      const newPrice = validatedInput.price ?? orderItem.price;
      const newSubTotal = newQuantity * newPrice;

      await tx.orderItem.update({
        where: { id: validatedInput.itemId },
        data: {
          quantity: newQuantity,
          price: newPrice,
          subTotal: newSubTotal,
        },
      });

      if (quantityDiff !== 0 && orderItem.productId) {
        await tx.product.update({
          where: { id: orderItem.productId },
          data: { amount: { decrement: quantityDiff } },
        });

        await tx.stockMovement.create({
          data: {
            type: "SALE",
            quantity: -quantityDiff,
            productId: orderItem.productId,
            orderId: order.id,
            businessId,
          },
        });

        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        await tx.productRanking.upsert({
          where: {
            productId_month_year_businessId: {
              productId: orderItem.productId,
              month,
              year,
              businessId,
            },
          },
          update: { 
            totalSold: { increment: quantityDiff },
            totalIncome: { increment: quantityDiff * orderItem.price }
          },
          create: {
            productId: orderItem.productId,
            month,
            year,
            businessId,
            totalSold: quantityDiff > 0 ? quantityDiff : 0,
            totalIncome: quantityDiff > 0 ? quantityDiff * orderItem.price : 0,
          },
        });
      }

      const itemsTotal = order.items.reduce((sum, item) => {
        if (item.id === validatedInput.itemId) {
          return sum + newSubTotal;
        }
        return sum + item.subTotal;
      }, 0);

      const totalDiff = itemsTotal - order.total;

      await tx.order.update({
        where: { id: validatedInput.orderId },
        data: { total: itemsTotal },
      });

      if (order.clientId && totalDiff !== 0) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { increment: totalDiff } },
        });
      }

      revalidateTag(CACHE_TAGS.ORDERS, "max");
      revalidateTag(CACHE_TAGS.STOCK, "max");
      revalidateTag(CACHE_TAGS.CLIENTS, "max");
      await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

      return { success: true };
    });
  } catch (error) {
    console.error("Error updating order item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al actualizar el item",
    };
  }
};

export const removeOrderItem = async (input: z.infer<typeof removeOrderItemSchema>): Promise<ActionResult> => {
  try {
    const validatedInput = removeOrderItemSchema.parse(input);
    const session = await auth();
    const businessId = session?.user?.businessId;
    if (!businessId) return { success: false, error: "No autorizado" };

    const permission = await assertWritePermission();
    if (!permission.success) return { success: false, error: permission.error, code: permission.code };

    return await db.$transaction(async (tx) => {
      const orderItem = await tx.orderItem.findUnique({
        where: { id: validatedInput.itemId },
      });

      if (!orderItem) throw new Error("Item no encontrado");

      const order = await tx.order.findUnique({
        where: { id: validatedInput.orderId },
        include: { items: true, client: true },
      });

      if (!order) throw new Error("Orden no encontrada");
      if (order.businessId && order.businessId !== businessId) throw new Error("Orden no encontrada");
      if (orderItem.orderId !== order.id) throw new Error("Item no encontrado");
      if (order.paidStatus === "pago") throw new Error("No se puede modificar una orden pagado");

      await tx.orderItem.delete({
        where: { id: validatedInput.itemId },
      });

      if (orderItem.productId) {
        await tx.product.update({
          where: { id: orderItem.productId },
          data: { amount: { increment: orderItem.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            type: "RETURN",
            quantity: orderItem.quantity,
            productId: orderItem.productId,
            orderId: order.id,
            businessId,
          },
        });

        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        await tx.productRanking.upsert({
          where: {
            productId_month_year_businessId: {
              productId: orderItem.productId,
              month,
              year,
              businessId,
            },
          },
          update: { 
            totalSold: { decrement: orderItem.quantity },
            totalIncome: { decrement: orderItem.quantity * orderItem.price }
          },
          create: {
            productId: orderItem.productId,
            month,
            year,
            businessId,
            totalSold: 0,
            totalIncome: 0,
          },
        });
      }

      const newTotal = order.total - orderItem.subTotal;

      await tx.order.update({
        where: { id: validatedInput.orderId },
        data: { total: newTotal },
      });

      if (order.clientId) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { decrement: orderItem.subTotal } },
        });
      }

      revalidateTag(CACHE_TAGS.ORDERS, "max");
      revalidateTag(CACHE_TAGS.STOCK, "max");
      revalidateTag(CACHE_TAGS.CLIENTS, "max");
      await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

      return { success: true };
    });
  } catch (error) {
    console.error("Error removing order item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al eliminar el item",
    };
  }
};
