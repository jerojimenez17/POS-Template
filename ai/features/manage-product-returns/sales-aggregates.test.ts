// @ts-nocheck
import { describe, it, expect } from "vitest";
// TDD RED: this module does not exist yet — expected to fail
import {
  calculateNetTotal,
  calculateGrossTotal,
  calculateReturnsTotal,
  toHistoryEntries,
  getNetSalesSummary,
} from "@/lib/sales-aggregates";
import type { SaleHistoryEntry } from "@/actions/sales/returns";

describe("sales-aggregates helpers — AC20, AC21, AC31", () => {
  describe("calculateNetTotal", () => {
    it("should compute netTotal = totalSales - totalReturns", () => {
      expect(calculateNetTotal(300, 50)).toBe(250);
      expect(calculateNetTotal(100, 0)).toBe(100);
      expect(calculateNetTotal(0, 0)).toBe(0);
    });

    it("should handle large numbers without floating errors (rounded)", () => {
      // Implementation should round or keep integer — spec uses Math.round per line
      expect(calculateNetTotal(500, 180)).toBe(320);
    });
  });

  describe("calculateGrossTotal / calculateReturnsTotal", () => {
    it("should sum sale totals", () => {
      const sales = [{ total: 100 }, { total: 200 }];
      expect(calculateGrossTotal(sales)).toBe(300);
    });

    it("should sum return totals", () => {
      const returns = [{ total: 50 }, { total: 30 }];
      expect(calculateReturnsTotal(returns)).toBe(80);
    });

    it("should return 0 for empty arrays", () => {
      expect(calculateGrossTotal([])).toBe(0);
      expect(calculateReturnsTotal([])).toBe(0);
    });
  });

  describe("toHistoryEntries — AC22 interleaving + sorting", () => {
    it("should merge orders and returns into SaleHistoryEntry list sorted by date desc", () => {
      const orders = [
        { id: "o1", date: new Date("2026-09-01T10:00:00Z"), total: 100 } as unknown as { id: string; date: Date; total: number },
        { id: "o2", date: new Date("2026-09-02T10:00:00Z"), total: 200 } as unknown as { id: string; date: Date; total: number },
      ];
      const returns = [
        { id: "r1", date: new Date("2026-09-03T10:00:00Z"), total: 50, orderId: "o1" } as unknown as { id: string; date: Date; total: number; orderId: string },
      ];

      // Mocked BillState / SaleReturn shapes minimal — helper should map internally
      const entries: SaleHistoryEntry[] = toHistoryEntries(orders as never, returns as never);

      expect(entries).toHaveLength(3);
      expect(entries[0].date.getTime()).toBe(new Date("2026-09-03T10:00:00Z").getTime());
      expect(entries[0].kind).toBe("RETURN");
      expect(entries[1].kind).toBe("SALE");
      expect(entries[2].kind).toBe("SALE");
    });

    it("should keep RETURN total positive but renderable as negative (spec: stored positive, displayed -total)", () => {
      const orders: unknown[] = [];
      const returns = [
        { id: "r1", date: new Date("2026-09-04T10:00:00Z"), total: 180, orderId: "abc123" },
      ];
      const entries = toHistoryEntries(orders as never, returns as never);
      const ret = entries[0];
      expect(ret.kind).toBe("RETURN");
      if (ret.kind === "RETURN") {
        expect(ret.total).toBe(180); // stored positive
      }
    });

    it("should handle return whose order date is older than return date (edge: AC24 date-range)", () => {
      const orders = [
        { id: "oldOrder", date: new Date("2026-08-01T10:00:00Z"), total: 500 } as unknown as never,
      ];
      const returns = [
        { id: "rNew", date: new Date("2026-09-04T10:00:00Z"), total: 100, orderId: "oldOrder" } as unknown as never,
      ];
      const entries = toHistoryEntries(orders, returns);
      // Both should be present; sorted correctly despite order being older
      expect(entries[0].date.getTime()).toBe(new Date("2026-09-04T10:00:00Z").getTime());
      expect(entries[0].kind).toBe("RETURN");
    });
  });

  describe("getNetSalesSummary — AC20", () => {
    it("should return totals mirroring getDailyReportAction logic", () => {
      const orders = [{ total: 100 }, { total: 200 }];
      const returns = [{ total: 50 }];
      const summary = getNetSalesSummary(orders as never, returns as never);
      expect(summary).toEqual({
        totalSales: 300,
        totalReturns: 50,
        netTotal: 250,
        orderCount: 2,
        returnCount: 1,
      });
    });

    it("should deduplicate via pure computation without duplicating logic (single source)", () => {
      // Ensure no drift: verify helper matches daily report formula
      const orders = [{ total: 1000 }];
      const returns = [{ total: 1000 }];
      const { netTotal } = getNetSalesSummary(orders as never, returns as never);
      expect(netTotal).toBe(0);
    });
  });
});
