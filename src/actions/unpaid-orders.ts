"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { MovementType, PaidStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { pusherServer } from "@/lib/pusher-server";
import { requireFeature, assertWritePermission } from "@/lib/auth-gates";
import { processInBatches, bulkUpdateStock } from "@/lib/batch-utils";
import {
  issuePaymentVoucherForSession,
} from "@/lib/server/payment-voucher";
import { paymentVoucherIssueFailureOutcome } from "@/lib/server/payment-voucher-outcome";
import { MAX_WHOLE_PESO_AMOUNT, toPositiveWholePesos, toWholePesos } from "@/lib/money";

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

const logPaymentSideEffectFailure = (code: string, error: unknown): void => {
  console.error("[registerPayment] post-commit side effect failed", {
    code,
    errorType: error instanceof Error ? "Error" : "NonError",
  });
};

type PaymentRegistrationErrorCode =
  | "ORDER_NOT_FOUND"
  | "INVALID_BALANCE"
  | "OVERPAYMENT";

const PAYMENT_REGISTRATION_ERROR_MESSAGES: Record<PaymentRegistrationErrorCode, string> = {
  ORDER_NOT_FOUND: "Orden no encontrada",
  INVALID_BALANCE: "El saldo de la orden no es válido",
  OVERPAYMENT: "El pago no puede exceder el saldo pendiente",
};

class PaymentRegistrationError extends Error {
  constructor(readonly code: PaymentRegistrationErrorCode) {
    super(PAYMENT_REGISTRATION_ERROR_MESSAGES[code]);
    this.name = "PaymentRegistrationError";
  }
}

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
  // Modal de origen: define la feature que debe estar habilitada para agregar
  // ítems, de modo que coincida con la de "crear nueva orden".
  mode: z.enum(["unpaid", "budget"]).optional(),
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
    const allowNegativeStock = (session?.user?.business?.features as Record<string, unknown>)?.hasNegativeStock === true;

    // Hoist ranking data so after() can access it
    const rankingItems: { productId: string; quantity: number; price: number }[] = [];

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
        if (!allowNegativeStock && product.amount < item.quantity) {
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
      });

      // 🚀 FASE 1+2: Bulk UPDATE (raw SQL) + stockMovement.createMany
      // Ranking upsert → after() (analítica, eventual consistency)
      const stockMovements: { type: MovementType; quantity: number; productId: string; orderId: string; businessId: string }[] = [];
      for (const item of input.items) {
        stockMovements.push({
          type: "SALE",
          quantity: -item.quantity,
          productId: item.productId,
          orderId: order.id,
          businessId,
        });
        rankingItems.push({ productId: item.productId, quantity: item.quantity, price: item.price });
      }

      await bulkUpdateStock(tx, input.items.map(i => ({ id: i.productId, change: -i.quantity })));
      await tx.stockMovement.createMany({ data: stockMovements });

      await tx.client.update({
        where: { id: input.clientId },
        data: { balance: { increment: input.total } },
      });

      return { success: true, data: order };
    }, {
      maxWait: 10000,
      timeout: 60000,
    });

    // ⏰ Respuesta inmediata — ranking + cache en background
    after(async () => {
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        await db.$transaction(async (tx) => {
          await processInBatches(rankingItems, 15, (item: { productId: string; quantity: number; price: number }) => [
            tx.productRanking.upsert({
              where: {
                productId_month_year_businessId: {
                  productId: item.productId,
                  month, year, businessId,
                },
              },
              update: {
                totalSold: { increment: item.quantity },
                totalIncome: { increment: item.quantity * item.price },
              },
              create: {
                productId: item.productId,
                month, year, businessId,
                totalSold: item.quantity,
                totalIncome: item.quantity * item.price,
              },
            }),
          ]);
        });

        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    return result;
  } catch (error) {
    console.error("Error creating unpaid order:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al crear la orden",
    };
  }
};

export const registerPayment = async (input: unknown): Promise<ActionResult> => {
  try {
    const parsedInput = z.object({
      orderId: z.string().min(1),
      amount: z.number().finite().positive(),
      paymentMethod: z.string().min(1),
      businessId: z.string().min(1),
      billType: z.enum(["Factura A", "Factura B", "Factura C", "Remito"]),
      ptoVenta: z.number().int().positive().optional(),
    }).strict().safeParse(input);
    if (!parsedInput.success) {
      const billTypeInvalid = parsedInput.error.issues.some((issue) => issue.path[0] === "billType");
      const error = billTypeInvalid
        ? "Seleccione Factura A, Factura B o Factura C"
        : "Los datos del pago no son válidos";
      return { success: false, error };
    }
    const paymentInput = parsedInput.data;
    const isRemito = paymentInput.billType === "Remito";
    if (isRemito && paymentInput.ptoVenta !== undefined) {
      return { success: false, error: "Los datos del pago no son válidos" };
    }
    if (!isRemito && (!Number.isSafeInteger(paymentInput.ptoVenta) || (paymentInput.ptoVenta ?? 0) <= 0)) {
      return { success: false, error: "Seleccione un punto de venta configurado" };
    }
    const paymentPesos = toPositiveWholePesos(paymentInput.amount);
    if (paymentPesos === null) {
      return { success: false, error: "Los datos del pago no son válidos" };
    }
    if (paymentPesos > MAX_WHOLE_PESO_AMOUNT) {
      return { success: false, error: "El importe del pago supera el máximo permitido" };
    }
    const businessId = await getAuthorizedBusinessId(paymentInput.businessId);
    if (!businessId) return { success: false, error: "No autorizado" };

    const permission = await assertWritePermission();
    if (!permission.success) return { success: false, error: permission.error, code: permission.code };

    if (!isRemito) {
      // A POS proposal is required for invoices before the payment transaction
      // begins. Read the authenticated business's current configuration rather
      // than trusting the UI's potentially stale list.
      const business = await db.business.findUnique({
        where: { id: businessId },
        select: { ptoVenta: true },
      });
      const configuredPtoVentas = business?.ptoVenta;
      if (!Array.isArray(configuredPtoVentas)
        || configuredPtoVentas.length === 0
        || configuredPtoVentas.some((value) => !Number.isSafeInteger(value) || value <= 0)
        || !configuredPtoVentas.includes(paymentInput.ptoVenta as number)) {
        return { success: false, error: "Seleccione un punto de venta configurado" };
      }
    }

    const movement = await db.$transaction(async (tx) => {
      // Serialize payment registrations per tenant/order before reading its
      // balance. Interpolated values are parameterized by Prisma's SQL tag.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Order"
        WHERE "id" = ${paymentInput.orderId}
          AND "businessId" = ${businessId}
        FOR UPDATE
      `;

      const order = await tx.order.findUnique({
        where: { id: paymentInput.orderId },
        include: { client: true, cashMovements: true },
      });
      if (!order || (order.businessId && order.businessId !== businessId)) {
        throw new PaymentRegistrationError("ORDER_NOT_FOUND");
      }

      const orderTotalPesos = toWholePesos(order.total);
      if (orderTotalPesos === null) {
        throw new PaymentRegistrationError("INVALID_BALANCE");
      }

      const movementPesos = order.cashMovements.map((cashMovement) => toWholePesos(cashMovement.total));
      if (movementPesos.some((pesos) => pesos === null)) {
        throw new PaymentRegistrationError("INVALID_BALANCE");
      }

      let totalPaidBeforePesos = 0;
      for (const pesos of movementPesos) {
        if (pesos === null) {
          throw new PaymentRegistrationError("INVALID_BALANCE");
        }
        const nextTotalPaidPesos = totalPaidBeforePesos + pesos;
        if (!Number.isSafeInteger(nextTotalPaidPesos)) {
          throw new PaymentRegistrationError("INVALID_BALANCE");
        }
        totalPaidBeforePesos = nextTotalPaidPesos;
      }

      const remainingBeforePesos = orderTotalPesos - totalPaidBeforePesos;
      if (!Number.isSafeInteger(remainingBeforePesos) || remainingBeforePesos < 0) {
        throw new PaymentRegistrationError("INVALID_BALANCE");
      }
      if (paymentPesos > remainingBeforePesos) {
        throw new PaymentRegistrationError("OVERPAYMENT");
      }

      const remainingBalancePesos = remainingBeforePesos - paymentPesos;

      const cashMovementData = {
        total: paymentPesos,
        paidMethod: paymentInput.paymentMethod,
        businessId,
        date: new Date(),
        orderId: paymentInput.orderId,
      };
      const newMovement = await tx.cashMovement.create({ data: cashMovementData });

      if (isRemito) {
        await tx.paymentVoucher.create({
          data: {
            cashMovementId: newMovement.id,
            businessId,
            status: "NOT_REQUIRED",
            amount: paymentPesos,
            billType: "Remito",
            afipVoucherType: null,
            invoiceNumber: null,
            invoicePointOfSale: null,
            cae: null,
            caeVencimiento: null,
            qrData: null,
            issuedAt: null,
            fiscalSnapshot: Prisma.DbNull,
            currentAttempt: 0,
          },
        });
      }

      if (order.clientId) {
        await tx.client.update({
          where: { id: order.clientId },
          data: { balance: { decrement: paymentPesos } },
        });
      }

      const newPaidStatus: PaidStatus =
        remainingBalancePesos === 0 ? "pago" : "inpago";
      await tx.order.update({
        where: { id: paymentInput.orderId },
        data: { paidStatus: newPaidStatus },
      });

      return newMovement;
    });

    try {
      await pusherServer.trigger(`movements-${businessId}`, "new-movement", movement);
    } catch (notificationError: unknown) {
      logPaymentSideEffectFailure("PAYMENT_PUSHER_NOTIFICATION_FAILED", notificationError);
    }

    for (const tag of [CACHE_TAGS.ORDERS, CACHE_TAGS.CLIENTS, CACHE_TAGS.CASHBOX]) {
      try {
        revalidateTag(tag, "max");
      } catch (cacheError: unknown) {
        logPaymentSideEffectFailure("PAYMENT_CACHE_INVALIDATION_FAILED", cacheError);
      }
    }

    if (isRemito) {
      return { success: true, data: { paymentRecorded: true, voucherStatus: "NOT_REQUIRED" } };
    }

    try {
      const voucherResult = await issuePaymentVoucherForSession({
        cashMovementId: movement.id,
        billType: paymentInput.billType,
        ptoVenta: paymentInput.ptoVenta as number,
      });
      return { success: true, data: { ...voucherResult, paymentRecorded: true } };
    } catch (voucherError: unknown) {
      const outcome = paymentVoucherIssueFailureOutcome(voucherError);
      logPaymentSideEffectFailure(`PAYMENT_VOUCHER_OUTCOME_${outcome.voucherStatus}`, voucherError);
      return {
        success: true,
        data: outcome,
      };
    }
  } catch (error) {
    console.error("Error registering payment", {
      code: "PAYMENT_REGISTRATION_FAILED",
      errorType: error instanceof PaymentRegistrationError ? error.code : error instanceof Error ? "Error" : "NonError",
    });
    return {
      success: false,
      error: error instanceof PaymentRegistrationError
        ? PAYMENT_REGISTRATION_ERROR_MESSAGES[error.code]
        : "No se pudo registrar el pago. Intente nuevamente.",
    };
  }
};

export const cancelUnpaidOrder = async (input: CancelUnpaidOrderInput): Promise<ActionResult> => {
  try {
    const businessId = await getAuthorizedBusinessId(input.businessId);
    if (!businessId) return { success: false, error: "No autorizado" };

    const permission = await assertWritePermission();
    if (!permission.success) return { success: false, error: permission.error, code: permission.code };

    // Hoist ranking data for after()
    const rankingItems: { productId: string; quantity: number; price: number }[] = [];

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

      // 🚀 FASE 2: Bulk UPDATE en vez de for...of con updates individuales
      const stockChanges: { id: string; change: number }[] = [];
      for (const item of order.items) {
        if (item.productId) {
          stockChanges.push({ id: item.productId, change: item.quantity });
          rankingItems.push({ productId: item.productId, quantity: -item.quantity, price: item.price });
        }
      }
      await bulkUpdateStock(tx, stockChanges);

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

    // ⏰ Respuesta inmediata — ranking + cache en background
    after(async () => {
      try {
        if (rankingItems.length > 0) {
          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();

          await db.$transaction(async (tx) => {
            await processInBatches(rankingItems, 15, (item: { productId: string; quantity: number; price: number }) => [
              tx.productRanking.upsert({
                where: {
                  productId_month_year_businessId: {
                    productId: item.productId, month, year, businessId,
                  },
                },
                update: {
                  totalSold: { increment: item.quantity },
                  totalIncome: { increment: item.quantity * item.price },
                },
                create: {
                  productId: item.productId, month, year, businessId,
                  totalSold: 0,
                  totalIncome: 0,
                },
              }),
            ]);
          });
        }

        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

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

    const permission = await assertWritePermission();
    if (!permission.success) return { success: false, error: permission.error, code: permission.code };

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
    const session = await auth();
    const allowNegativeStock = (session?.user?.business?.features as Record<string, unknown>)?.hasNegativeStock === true;

    // Hoist ranking data for after()
    const rankingItems: { productId: string; quantity: number; price: number }[] = [];

    const result = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: validatedInput.orderId },
        include: { client: true, items: true },
      });

      if (!order) throw new Error("Orden no encontrada");
      if (order.businessId && order.businessId !== businessId) throw new Error("Orden no encontrada");
      if (order.paidStatus === "pago") throw new Error("No se puede modificar una orden pagado");

      // La funcionalidad debe estar habilitada en el plan tanto para crear como
      // para agregar ítems. Si viene el modo del modal, usamos su feature para
      // que "agregar a existente" y "crear nueva" queden bloqueados juntos;
      // sin modo (edición directa) caemos al tipo de orden.
      const requiredFeature =
        validatedInput.mode === "budget"
          ? "hasBudget"
          : validatedInput.mode === "unpaid"
            ? "hasClientLedger"
            : order.status === "pendiente"
              ? "hasBudget"
              : "hasClientLedger";
      const featureCheck = await requireFeature(requiredFeature, permission.data);
      if (!featureCheck.success) {
        throw new Error(featureCheck.error || "Esta funcionalidad no está disponible en tu plan actual.");
      }

      const products = await tx.product.findMany({
        where: { id: { in: validatedInput.items.map(i => i.productId) }, businessId },
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      for (const item of validatedInput.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error(`Producto ${item.description || item.productId} no encontrado`);
        }
        if (!allowNegativeStock && product.amount < item.quantity) {
          throw new Error(`Stock insuficiente para ${item.description || item.productId}`);
        }
      }

      // 🚀 FASE 1+2: Bulk UPDATE + createMany (orderItems + stockMovements)
      // Ranking → after()
      const stockMovements: { type: MovementType; quantity: number; productId: string; orderId: string; businessId: string }[] = [];
      for (const item of validatedInput.items) {
        stockMovements.push({
          type: "SALE",
          quantity: -item.quantity,
          productId: item.productId,
          orderId: validatedInput.orderId,
          businessId,
        });
        rankingItems.push({ productId: item.productId, quantity: item.quantity, price: item.price });
      }

      await bulkUpdateStock(tx, validatedInput.items.map(i => ({ id: i.productId, change: -i.quantity })));
      await tx.stockMovement.createMany({ data: stockMovements });

      // ✅ Crear los OrderItem para que aparezcan en el detalle de la orden
      await tx.orderItem.createMany({
        data: validatedInput.items.map((item) => ({
          orderId: validatedInput.orderId,
          productId: item.productId,
          code: item.code || null,
          description: item.description || null,
          costPrice: item.costPrice || 0,
          price: item.price,
          quantity: item.quantity,
          subTotal: item.subTotal,
        })),
      });

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

      return { success: true };
    }, { maxWait: 10000, timeout: 60000 });

    // ⏰ Respuesta inmediata — ranking + cache en background
    after(async () => {
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        await db.$transaction(async (tx) => {
          await processInBatches(rankingItems, 15, (item: { productId: string; quantity: number; price: number }) => [
            tx.productRanking.upsert({
              where: {
                productId_month_year_businessId: {
                  productId: item.productId, month, year, businessId,
                },
              },
              update: {
                totalSold: { increment: item.quantity },
                totalIncome: { increment: item.quantity * item.price },
              },
              create: {
                productId: item.productId, month, year, businessId,
                totalSold: item.quantity,
                totalIncome: item.quantity * item.price,
              },
            }),
          ]);
        });

        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    return result;
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
    const allowNegativeStock = (session?.user?.business?.features as Record<string, unknown>)?.hasNegativeStock === true;

    // Hoist ranking data for after()
    let rankingData: { productId: string; quantity: number; price: number } | null = null;

    const result = await db.$transaction(async (tx) => {
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
        if (!product) {
          throw new Error("Producto no encontrado");
        }
        if (!allowNegativeStock && product.amount < quantityDiff) {
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
        // 🚀 FASE 2: bulkUpdateStock (aunque sea 1 item, consistente)
        await bulkUpdateStock(tx, [{ id: orderItem.productId, change: -quantityDiff }]);

        await tx.stockMovement.create({
          data: {
            type: "SALE",
            quantity: -quantityDiff,
            productId: orderItem.productId,
            orderId: order.id,
            businessId,
          },
        });

        rankingData = {
          productId: orderItem.productId,
          quantity: quantityDiff,
          price: orderItem.price,
        };
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

      return { success: true };
    });

    // ⏰ Respuesta inmediata — ranking + cache en background
    after(async () => {
      try {
        if (rankingData) {
          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();

          await db.$transaction(async (tx) => {
            await tx.productRanking.upsert({
              where: {
                productId_month_year_businessId: {
                  productId: rankingData!.productId,
                  month, year, businessId,
                },
              },
              update: {
                totalSold: { increment: rankingData!.quantity },
                totalIncome: { increment: rankingData!.quantity * rankingData!.price },
              },
              create: {
                productId: rankingData!.productId,
                month, year, businessId,
                totalSold: rankingData!.quantity > 0 ? rankingData!.quantity : 0,
                totalIncome: rankingData!.quantity > 0 ? rankingData!.quantity * rankingData!.price : 0,
              },
            });
          });
        }

        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    return result;
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

    // Hoist ranking data for after()
    let rankingData: { productId: string; quantity: number; price: number } | null = null;

    const result = await db.$transaction(async (tx) => {
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
        // 🚀 FASE 2: bulkUpdateStock (increment stock — change positivo)
        await bulkUpdateStock(tx, [{ id: orderItem.productId, change: orderItem.quantity }]);

        await tx.stockMovement.create({
          data: {
            type: "RETURN",
            quantity: orderItem.quantity,
            productId: orderItem.productId,
            orderId: order.id,
            businessId,
          },
        });

        rankingData = {
          productId: orderItem.productId,
          quantity: -orderItem.quantity,
          price: orderItem.price,
        };
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

      return { success: true };
    });

    // ⏰ Respuesta inmediata — ranking + cache en background
    after(async () => {
      try {
        if (rankingData) {
          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();

          await db.$transaction(async (tx) => {
            await tx.productRanking.upsert({
              where: {
                productId_month_year_businessId: {
                  productId: rankingData!.productId,
                  month, year, businessId,
                },
              },
              update: {
                totalSold: { increment: rankingData!.quantity },
                totalIncome: { increment: rankingData!.quantity * rankingData!.price },
              },
              create: {
                productId: rankingData!.productId,
                month, year, businessId,
                totalSold: 0,
                totalIncome: 0,
              },
            });
          });
        }

        revalidateTag(CACHE_TAGS.ORDERS, "max");
        revalidateTag(CACHE_TAGS.STOCK, "max");
        revalidateTag(CACHE_TAGS.CLIENTS, "max");
        await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
      } catch (bgError) {
        console.error("Background after() error (non-critical):", bgError);
      }
    });

    return result;
  } catch (error) {
    console.error("Error removing order item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al eliminar el item",
    };
  }
};
