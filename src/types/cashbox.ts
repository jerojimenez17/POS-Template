export interface ZReport {
  totalSales: number;
  totalDiscounts: number;
  totalReturns: number;
  netTotal: number;
  orderCount: number;
  returnCount: number;
  paymentMethods: Record<string, number>;
  expectedFinalBalance: number;
  declaredFinalBalance: number;
  difference: number;
}

export interface CashboxSessionData {
  id: string;
  cashboxId: string;
  userId: string;
  businessId: string;
  startTime: Date;
  endTime: Date | null;
  initialBalance: number;
  finalBalance: number | null;
  status: "OPEN" | "CLOSED";
  zReport: ZReport | null;
}

export interface CashboxData {
  id: string;
  name: string;
  total: number;
  businessId: string;
  updatedAt: Date;
}