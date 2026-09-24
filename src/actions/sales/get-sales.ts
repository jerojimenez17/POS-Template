"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { PAGINATION } from "@/lib/pagination";
import type BillState from "@/models/BillState";
import type { Prisma } from "@prisma/client";
import { normalizePaymentMethod } from "@/utils/payment-methods";
import { classifySalesSearchPresentation } from "@/services/sales-document-classification";
import { mapOrderToBillState } from "./history";

export interface SalesFilters {
  // FACTURA_C is retained as the token emitted by the current UI. Both it and
  // FACTURA represent the complete set of persisted invoice variants.
  documentTypes: ("FACTURA" | "FACTURA_C" | "REMITO")[];
  paymentMethods: string[];
  startDate?: string;
  endDate?: string;
  seller?: string;
}

export interface GetSalesParams {
  cursor?: string;
  take?: number;
  filters?: SalesFilters;
}

export interface GetSalesResult {
  sales: BillState[];
  nextCursor: string | null;
}

type SalesOrder = Prisma.OrderGetPayload<{
  include: { items: true; client: true; returns: true };
}>;

export const getSalesAction = async (
  params?: GetSalesParams,
): Promise<GetSalesResult> => {
  try {
    const session = await auth();
    const businessId = session?.user?.businessId;
    if (!businessId) return { sales: [], nextCursor: null };

    const requestedTake = params?.take ?? PAGINATION.SALES_MAX;
    const take = Number.isFinite(requestedTake)
      ? Math.min(Math.max(Math.floor(requestedTake), 1), PAGINATION.SALES_MAX)
      : PAGINATION.SALES_MAX;
    const filters = params?.filters;
    const where: Prisma.OrderWhereInput = { businessId, paidStatus: "pago" };
    if (filters?.seller) where.seller = filters.seller;
    if (filters?.paymentMethods?.length) {
      const paymentMethods = [...new Set(filters.paymentMethods.map(normalizePaymentMethod))];
      // Keep this OR grouped so it can coexist with the cursor OR below.
      // A split payment matches when either persisted payment field matches.
      where.AND = [{ OR: [
        { paymentMethod: { in: paymentMethods } },
        { paymentMethod2: { in: paymentMethods } },
      ] }];
    }
    const documentTypes = new Set(filters?.documentTypes ?? []);
    if (filters?.startDate || filters?.endDate) {
      where.date = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
      };
    }
    let scanCursor: SalesCursor | undefined;
    if (params?.cursor !== undefined) {
      const decodedCursor = decodeCursor(params.cursor);
      if (!decodedCursor) return { sales: [], nextCursor: null };

      if (decodedCursor.kind === "composite") {
        scanCursor = decodedCursor.cursor;
      } else {
        const anchor = await db.order.findFirst({
          where: { id: decodedCursor.id, businessId },
          select: { id: true, date: true },
        });
        if (!anchor || anchor.id !== decodedCursor.id || !(anchor.date instanceof Date)
          || Number.isNaN(anchor.date.getTime())) {
          return { sales: [], nextCursor: null };
        }
        scanCursor = { date: anchor.date, id: anchor.id };
      }
    }

    const invoiceFilter = documentTypes.has("FACTURA") || documentTypes.has("FACTURA_C");
    const remitoFilter = documentTypes.has("REMITO");
    const hasDocumentFilter = invoiceFilter || remitoFilter;
    const batchSize = Math.min(Math.max(take + 1, 50), 100);
    const matches: SalesOrder[] = [];

    while (matches.length < take + 1) {
      const batchWhere: Prisma.OrderWhereInput = { ...where };
      if (scanCursor) {
        batchWhere.OR = [
          { date: { lt: scanCursor.date } },
          { date: { gte: scanCursor.date, lte: scanCursor.date }, id: { lt: scanCursor.id } },
        ];
      }
      const candidates = await db.order.findMany({
        where: batchWhere,
        include: {
          items: true,
          client: true,
          returns: true,
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: batchSize,
      });
      if (candidates.length === 0) break;

      for (const candidate of candidates) {
        scanCursor = { date: candidate.date, id: candidate.id };
        if (!hasDocumentFilter) {
          matches.push(candidate);
          continue;
        }
        const classification = classifySalesSearchPresentation(candidate as unknown as Record<string, unknown>);
        if ((invoiceFilter && classification === "FACTURA") || (remitoFilter && classification === "REMITO")) {
          matches.push(candidate);
        }
      }
      if (candidates.length < batchSize) break;
    }

    const hasMore = matches.length > take;
    const results = hasMore ? matches.slice(0, take) : matches;
    const last = results[results.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.date, last.id) : null;

    return { sales: results.map(mapOrderToBillState), nextCursor };
  } catch (error) {
    console.error("Error fetching sales:", error);
    return { sales: [], nextCursor: null };
  }
};

interface SalesCursor { date: Date; id: string }
type DecodedSalesCursor =
  | { kind: "composite"; cursor: SalesCursor }
  | { kind: "legacy"; id: string };

const encodeCursor = (date: Date, id: string): string =>
  Buffer.from(JSON.stringify({ date: (date ?? new Date(0)).toISOString(), id })).toString("base64url");

const decodeCursor = (cursor: string): DecodedSalesCursor | null => {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    let value: unknown;
    try {
      value = JSON.parse(decoded) as unknown;
    } catch {
      // Composite cursors are JSON. If a damaged composite still has a JSON
      // object/array prefix, reject it rather than treating it as a raw ID.
      if (/^\s*[{[]/.test(decoded)) return null;
      return cursor.trim() ? { kind: "legacy", id: cursor } : null;
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || typeof record.date !== "string"
      || typeof record.id !== "string" || !record.id.trim()) return null;
    const date = new Date(record.date);
    return Number.isNaN(date.getTime()) || date.toISOString() !== record.date
      ? null
      : { kind: "composite", cursor: { date, id: record.id } };
  } catch {
    return cursor.trim() ? { kind: "legacy", id: cursor } : null;
  }
};
