import type BillState from "@/models/BillState";
import type { SaleReturn, SaleReturnItem } from "@prisma/client";

export function calculateNetTotal(totalSales: number, totalReturns: number): number {
  return totalSales - totalReturns;
}

export function calculateGrossTotal(sales: Array<{ total: number }>): number {
  if (!sales || sales.length === 0) return 0;
  return sales.reduce((acc, s) => acc + (s.total ?? 0), 0);
}

export function calculateReturnsTotal(returns: Array<{ total: number }>): number {
  if (!returns || returns.length === 0) return 0;
  return returns.reduce((acc, r) => acc + (r.total ?? 0), 0);
}

export interface SaleHistoryEntrySale {
  kind: "SALE";
  id: string;
  date: Date;
  total: number;
  bill: BillState;
}

export interface SaleHistoryEntryReturn {
  kind: "RETURN";
  id: string;
  date: Date;
  total: number;
  orderId: string;
  reason: string | null;
  saleReturn: SaleReturn & { items: SaleReturnItem[] };
}

export type SaleHistoryEntry = SaleHistoryEntrySale | SaleHistoryEntryReturn;

type OrderLike = { id: string; date: Date | string; total: number };
type ReturnLike = { id: string; date: Date | string; total: number; orderId: string; reason?: string | null };

export function toHistoryEntries(
  orders: OrderLike[],
  returns: ReturnLike[],
): SaleHistoryEntry[] {
  const saleEntries: SaleHistoryEntry[] = (orders ?? []).map((o) => ({
    kind: "SALE" as const,
    id: o.id,
    date: o.date instanceof Date ? o.date : new Date(o.date),
    total: o.total,
    bill: o as BillState,
  }));
  const returnEntries: SaleHistoryEntry[] = (returns ?? []).map((r) => ({
    kind: "RETURN" as const,
    id: r.id,
    date: r.date instanceof Date ? r.date : new Date(r.date),
    total: r.total,
    orderId: r.orderId,
    reason: r.reason ?? null,
    saleReturn: r as SaleReturn & { items: SaleReturnItem[] },
  }));
  const merged = [...saleEntries, ...returnEntries];
  merged.sort((a, b) => b.date.getTime() - a.date.getTime());
  return merged;
}

export function getNetSalesSummary(
  orders: Array<{ total: number }>,
  returns: Array<{ total: number }>,
): { totalSales: number; totalReturns: number; netTotal: number; orderCount: number; returnCount: number } {
  const totalSales = calculateGrossTotal(orders);
  const totalReturns = calculateReturnsTotal(returns);
  const netTotal = calculateNetTotal(totalSales, totalReturns);
  return {
    totalSales,
    totalReturns,
    netTotal,
    orderCount: orders?.length ?? 0,
    returnCount: returns?.length ?? 0,
  };
}
