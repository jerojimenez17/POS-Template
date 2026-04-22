import type BillState from "@/models/BillState";
import type CAE from "@/models/CAE";

export interface SalesFilters {
  startDate?: Date;
  endDate?: Date;
  seller?: string;
  saleTypes?: string[];
  paymentMethods?: string[];
}

export interface SalesStats {
  totalSales: number;
  totalToday: number;
  todayCount: number;
}

export interface PaginatedSales {
  sales: BillState[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  stats: SalesStats;
}

export interface ISalesRepository {
  getFilteredSales(
    businessId: string,
    cursor?: string,
    limit?: number,
    filters?: SalesFilters
  ): Promise<PaginatedSales>;

  getStats(
    businessId: string,
    filters?: SalesFilters
  ): Promise<SalesStats>;

  getTodayStats(
    businessId: string,
    filters?: SalesFilters
  ): Promise<Pick<SalesStats, "totalToday" | "todayCount">>;
}