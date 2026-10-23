import { db } from "@/lib/db";
import { auth } from "@/auth";
import type BillState from "@/models/BillState";
import { StockActivityItem } from "@/components/StockActivityModal";
import { fail } from "@/lib/action-result";
import { Prisma } from "@prisma/client";
import { normalizeHistoricalDocumentType } from "@/lib/print/receipt-data";
import { parseCAE } from "@/lib/cae";
import { getRecoveredSalesBillType } from "@/services/sales-document-classification";
import { CREDIT_NOTE_NON_ACTIONABLE_MESSAGE, getFiscalDiagnosticLogFields, normalizeAuthorizedFiscalSnapshot, normalizeSaleFiscalMetadata, type SaleFiscalContext, type SaleFiscalDiagnostic, type SaleFiscalRecovery } from "@/services/afip/credit-note";

type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: true; client: true };
}>;

export function mapOrderToBillState(order: OrderWithItems & Record<string, unknown>): BillState {
  const metadata = order as OrderWithItems & {
    billType?: string; afipVoucherType?: number; invoiceNumber?: number; invoicePointOfSale?: number; invoiceIssuedAt?: Date; fiscalSnapshot?: unknown;
    saleReturns?: Array<Record<string, unknown>>; returns?: Array<Record<string, unknown>>;
  };
  const returnRows = metadata.saleReturns ?? metadata.returns;
  const resolvedBillType = getRecoveredSalesBillType({
    billType: metadata.billType,
    afipVoucherType: metadata.afipVoucherType,
    CAE: order.CAE,
  });
  const legacyDocument = order.clientDocumentNumber || "";
  // Legacy rows did not store the selected type: retain the documented length fallback.
  const clientDocumentType = normalizeHistoricalDocumentType(order.clientDocumentType, legacyDocument) || undefined;
  const persistedOrder = order as unknown as Record<string, unknown>;
  const fiscalInput: Record<string, unknown> = { cae: order.CAE };
  for (const field of ["billType", "afipVoucherType", "invoiceNumber", "invoicePointOfSale"] as const) {
    if (Object.prototype.hasOwnProperty.call(persistedOrder, field)) {
      fiscalInput[field] = persistedOrder[field];
    }
  }
  const fiscalResult = normalizeSaleFiscalMetadata(fiscalInput);
  const normalizedFiscal = fiscalResult.status === "VALID" ? fiscalResult.metadata : undefined;
  const fiscalSnapshot = normalizedFiscal ? normalizeAuthorizedFiscalSnapshot(metadata.fiscalSnapshot, {
    billType: normalizedFiscal.billType,
    afipVoucherType: normalizedFiscal.originalAfipVoucherType,
    total: order.total,
  }) : undefined;
  const fiscalReturn = returnRows?.find((candidate) => candidate.kind === "CREDIT_NOTE"
    || candidate.creditNoteAfipType != null || typeof candidate.creditNoteCAE === "string");
  const creditNoteStatus = fiscalReturn && ["PENDING", "AUTHORIZED", "REJECTED"].includes(String(fiscalReturn.status))
    ? {
      status: fiscalReturn.status as "PENDING" | "AUTHORIZED" | "REJECTED",
      canFinalizeLocally: fiscalReturn.status === "PENDING"
        && typeof fiscalReturn.creditNoteCAE === "string" && /^\d{14}$/.test(fiscalReturn.creditNoteCAE)
        && typeof fiscalReturn.creditNoteNumber === "number" && Number.isInteger(fiscalReturn.creditNoteNumber) && fiscalReturn.creditNoteNumber > 0
        && typeof fiscalReturn.creditNotePointOfSale === "number" && Number.isInteger(fiscalReturn.creditNotePointOfSale) && fiscalReturn.creditNotePointOfSale > 0,
    } : null;
  const hasCompleteContent = order.total > 0 && order.items.length > 0 && order.items.every((item) => !!item.productId && item.quantity > 0);
  const fiscalContext: SaleFiscalContext | undefined = normalizedFiscal ? {
    orderId: order.id,
    billType: normalizedFiscal.billType,
    originalAfipVoucherType: normalizedFiscal.originalAfipVoucherType,
    originalCAE: normalizedFiscal.originalCAE,
    invoiceNumber: normalizedFiscal.invoiceNumber,
    invoicePointOfSale: normalizedFiscal.invoicePointOfSale,
    total: order.total,
    products: order.items.map((item) => ({ id: item.productId || item.id, description: item.description || "", amount: item.quantity, salePrice: item.price })),
    creditNote: creditNoteStatus,
    eligibleForFullCreditNote: creditNoteStatus?.status !== "AUTHORIZED" && hasCompleteContent && order.total > 0 && !!fiscalSnapshot,
  } : undefined;
  const diagnostic: SaleFiscalDiagnostic | undefined = fiscalResult.status === "INVALID_OR_INCOMPLETE"
    ? { status: "INVALID_OR_INCOMPLETE", reason: fiscalResult.reason, message: diagnosticMessage(fiscalResult.reason) }
    : normalizedFiscal && creditNoteStatus?.status === "AUTHORIZED"
      ? { status: "INELIGIBLE", reason: "ALREADY_AUTHORIZED", message: "La venta ya tiene una Nota de Crédito autorizada." }
         : normalizedFiscal && !hasCompleteContent
         ? { status: "INELIGIBLE", reason: "SALE_CONTENT_INCOMPLETE", message: "La venta no tiene un detalle completo para ofrecer una Nota de Crédito." }
         : normalizedFiscal && !fiscalSnapshot
           ? { status: "INELIGIBLE", reason: "FISCAL_SNAPSHOT_MISSING", message: "No se puede emitir la Nota de Crédito porque no está disponible el desglose fiscal original. Consulte/recupere el comprobante en ARCA." }
         : undefined;
  const recovery: SaleFiscalRecovery | undefined = fiscalResult.status === "INVALID_OR_INCOMPLETE" && fiscalResult.canCompleteFromUser && fiscalResult.missingFields
    ? {
      orderId: order.id,
      missingFields: fiscalResult.missingFields,
      known: {
        ...(metadata.billType && typeof metadata.billType === "string" ? { billType: metadata.billType as SaleFiscalRecovery["known"]["billType"] } : {}),
        ...(typeof metadata.invoiceNumber === "number" ? { invoiceNumber: metadata.invoiceNumber } : {}),
        ...(typeof metadata.invoicePointOfSale === "number" ? { invoicePointOfSale: metadata.invoicePointOfSale } : {}),
      },
      total: order.total,
      products: order.items.map((item) => ({ id: item.productId || item.id, description: item.description || "", amount: item.quantity, salePrice: item.price })),
      creditNoteStatus: creditNoteStatus?.status ?? null,
    }
    : undefined;
  if (fiscalResult.status === "INVALID_OR_INCOMPLETE") logFiscalDiagnostic(order, fiscalResult, {
    billType: metadata.billType,
    afipVoucherType: metadata.afipVoucherType,
    invoiceNumber: metadata.invoiceNumber,
    invoicePointOfSale: metadata.invoicePointOfSale,
    cae: order.CAE,
  });

  return {
    id: order.id,
    products: order.items.map((item) => ({
      id: item.productId || item.id,
      code: item.code || "",
      codebar: "",
      description: item.description || "",
      price: item.costPrice,
      salePrice: item.price,
      amount: item.quantity,
      unit: "unidades",
      // Remaining fields to satisfy Product type
      brand: "",
      subCategory: "",
      gain: 0,
      suplier: { id: "", name: "", email: "", phone: "", discount: 0, iva: 0, gain: 0, creation_date: new Date() },
      client_bonus: 0,
      image: "",
      imageName: "",
      images: [],
      last_update: new Date(),
      creation_date: new Date(),
      category: "",
      catalog: true,
      details: "",
    })),
    total: order.total + order.discountAmount,
    totalWithDiscount: order.total,
    client: order.client?.name || undefined,
    clientId: order.clientId || undefined,
    seller: order.seller || "",
    discount: order.discountPercentage,
    date: order.date,
    typeDocument: clientDocumentType || "",
    documentNumber: legacyDocument ? Number(legacyDocument) : 0,
    secondPaidMethod: order.paymentMethod2 || undefined,
    totalSecondMethod: order.totalMethod2 || undefined,
    IVACondition: order.clientIvaCondition || "Consumidor Final",
    clientIvaCondition: order.clientIvaCondition || undefined,
    clientDocumentNumber: order.clientDocumentNumber || undefined,
    clientDocumentType,
    CAE: parseCAE(order.CAE),
    ptoVenta: normalizedFiscal?.invoicePointOfSale,
    billType: resolvedBillType,
    originalVoucher: normalizedFiscal
      ? { billType: normalizedFiscal.billType, afipVoucherType: normalizedFiscal.originalAfipVoucherType, number: normalizedFiscal.invoiceNumber, pointOfSale: normalizedFiscal.invoicePointOfSale, issuedAt: metadata.invoiceIssuedAt ?? undefined }
      : undefined,
    creditNote: (() => {
      const item = returnRows?.find((candidate) => candidate.kind === "CREDIT_NOTE"
        || candidate.creditNoteAfipType != null || typeof candidate.creditNoteCAE === "string");
      if (!item || !["PENDING", "AUTHORIZED", "REJECTED"].includes(String(item.status)) || typeof item.originalNumber !== "number" || typeof item.originalPointOfSale !== "number") return undefined;
      return {
        status: item.status as "PENDING" | "AUTHORIZED" | "REJECTED",
        ...(item.status === "PENDING" && typeof item.creditNoteCAE === "string" && /^\d{14}$/.test(item.creditNoteCAE)
          && typeof item.creditNoteNumber === "number" && Number.isInteger(item.creditNoteNumber) && item.creditNoteNumber > 0
          && typeof item.creditNotePointOfSale === "number" && Number.isInteger(item.creditNotePointOfSale) && item.creditNotePointOfSale > 0
          ? { canFinalizeLocally: true }
          : {}),
        billType: item.creditNoteBillType as "Nota de Crédito A" | "Nota de Crédito B" | "Nota de Crédito C" | undefined,
        afipVoucherType: item.creditNoteAfipType as 3 | 8 | 13 | undefined,
        ...(typeof item.creditNoteCAE === "string" ? { cae: item.creditNoteCAE } : {}),
        number: typeof item.creditNoteNumber === "number" ? item.creditNoteNumber : undefined,
        pointOfSale: typeof item.creditNotePointOfSale === "number" ? item.creditNotePointOfSale : undefined,
        originalBillType: item.originalVoucherType === 1 ? "Factura A" : item.originalVoucherType === 11 ? "Factura C" : "Factura B",
        originalCae: typeof item.originalCAE === "string" ? item.originalCAE : (normalizedFiscal?.originalCAE ?? ""),
        originalAfipVoucherType: item.originalVoucherType as 1 | 6 | 11 | undefined,
        originalNumber: item.originalNumber,
        originalPointOfSale: item.originalPointOfSale,
      };
    })(),
    twoMethods: !!order.paymentMethod2 && order.totalMethod2 !== null && order.totalMethod2 > 0,
    paidMethod: order.paymentMethod || "Efectivo",
    ...(fiscalContext ? { fiscalContext } : {}),
    ...(diagnostic ? { fiscalDiagnostic: diagnostic } : {}),
    ...(recovery ? { creditNoteRecovery: recovery } : {}),
  };
}

function diagnosticMessage(reason: "CAE_INVALID" | "FISCAL_FIELDS_INCOMPLETE" | "FISCAL_TYPE_CONFLICT" | "FISCAL_TYPE_UNSUPPORTED"): string {
  switch (reason) {
    case "CAE_INVALID": return CREDIT_NOTE_NON_ACTIONABLE_MESSAGE;
    case "FISCAL_FIELDS_INCOMPLETE": return "Los datos fiscales de la venta están incompletos y no permiten ofrecer una Nota de Crédito. Revisá los datos fiscales.";
    case "FISCAL_TYPE_CONFLICT": return CREDIT_NOTE_NON_ACTIONABLE_MESSAGE;
    case "FISCAL_TYPE_UNSUPPORTED": return "El tipo de comprobante de la venta no permite ofrecer una Nota de Crédito.";
  }
}

function logFiscalDiagnostic(
  order: OrderWithItems & Record<string, unknown>,
  result: Extract<ReturnType<typeof normalizeSaleFiscalMetadata>, { status: "INVALID_OR_INCOMPLETE" }>,
  fiscalInput: Record<string, unknown>,
): void {
  const value = order as unknown as Record<string, unknown>;
  const fields = getFiscalDiagnosticLogFields(fiscalInput, result);
  console.info({
    event: "credit_note_eligibility_diagnostic",
    orderId: order.id,
    businessId: typeof value.businessId === "string" ? value.businessId : "unknown",
    status: result.status,
    reason: result.reason,
    ...fields,
  });
}

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
        where: { businessId, date: { gte: start, lte: end }, paidStatus: "pago" },
        include: { items: true },
      }),
       db.saleReturn.findMany({
         where: {
           businessId,
           date: { gte: start, lte: end },
           NOT: { status: "REJECTED" },
           OR: [
             { kind: "MANUAL_RETURN", status: { in: ["PENDING", "AUTHORIZED"] } },
             { kind: "CREDIT_NOTE", status: "AUTHORIZED" },
           ],
         },
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

    const outsMap = new Map<string, StockActivityItem>();
    const insMap = new Map<string, StockActivityItem>();

    stockMovements.forEach(sm => {
      if (sm.quantity === 0) return;
      const isOut = sm.quantity < 0;
      const absQty = Math.abs(sm.quantity);

      const targetMap = isOut ? outsMap : insMap;
      const existing = targetMap.get(sm.productId) || {
        productId: sm.productId,
        code: sm.product?.code || "",
        description: sm.product?.description || "Producto eliminado",
        quantity: 0
      };

      existing.quantity += absQty;
      targetMap.set(sm.productId, existing);
    });

    const outs = Array.from(outsMap.values()).sort((a, b) => b.quantity - a.quantity);
    const ins = Array.from(insMap.values()).sort((a, b) => b.quantity - a.quantity);

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
        stockActivity: { outs, ins },
      }
    };
  } catch (error) {
    console.error("Error fetching daily report:", error);
    return fail("Error al generar el reporte");
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
        returns: true,
      },
    });

    if (!order) return null;

    return mapOrderToBillState(order);
  } catch (error) {
    console.error("Error fetching sale:", error);
    return null;
  }
};

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

export { getSaleHistoryAction } from "./get-sale-history";
export { getSalesAction } from "./get-sales";
