import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getDailyReportAction } from "@/actions/sales/history";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    order: { findMany: vi.fn() },
    saleReturn: { findMany: vi.fn() },
    stockMovement: { findMany: vi.fn() },
  },
}));

describe("getDailyReportAction safe local report behavior", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
    vi.mocked(db.order.findMany).mockReset();
    vi.mocked(db.saleReturn.findMany).mockReset();
    vi.mocked(db.stockMovement.findMany).mockReset();
  });

  it("explains that an authenticated session has no assigned business without querying", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { businessId: null } } as never);

    const result = await getDailyReportAction(new Date("2026-06-30T12:00:00Z"));

    expect(result).toEqual({
      success: false,
      error: "Tu sesión no tiene un negocio asignado",
      code: "FORBIDDEN",
    });
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect(db.saleReturn.findMany).not.toHaveBeenCalled();
    expect(db.stockMovement.findMany).not.toHaveBeenCalled();
  });

  it("returns a zero-valued report for a valid empty historical range", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { businessId: "business-123" } } as never);
    vi.mocked(db.order.findMany).mockResolvedValue([]);
    vi.mocked(db.saleReturn.findMany).mockResolvedValue([]);
    vi.mocked(db.stockMovement.findMany).mockResolvedValue([]);

    const result = await getDailyReportAction(
      new Date("2020-01-01T12:00:00Z"),
      new Date("2020-01-31T12:00:00Z"),
    );

    expect(result).toEqual({
      success: true,
      data: {
        totalSales: 0,
        totalDiscounts: 0,
        totalReturns: 0,
        netTotal: 0,
        orderCount: 0,
        returnCount: 0,
        paymentMethods: {},
        stockMovementCount: 0,
        stockActivity: { outs: [], ins: [] },
      },
    });
  });

  it.each([
    ["orders", "order", "findMany"],
    ["returns", "saleReturn", "findMany"],
    ["stockMovements", "stockMovement", "findMany"],
  ] as const)("reports a safe phase when the %s read fails", async (phase, model, method) => {
    vi.mocked(auth).mockResolvedValue({ user: { businessId: "business-123" } } as never);
    vi.mocked(db.order.findMany).mockResolvedValue([]);
    vi.mocked(db.saleReturn.findMany).mockResolvedValue([]);
    vi.mocked(db.stockMovement.findMany).mockResolvedValue([]);
    const failure = Object.assign(new Error("secret query details"), { code: "P2025" });
    vi.mocked(db[model][method]).mockRejectedValue(failure);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await getDailyReportAction(new Date("2026-06-30T12:00:00Z"));

    expect(result).toEqual({ success: false, error: "Error al generar el reporte" });
    expect(log).toHaveBeenCalledWith("Daily report query failed", {
      phase,
      name: "Error",
      code: "P2025",
    });
    expect(log.mock.calls.flat()).not.toContain("secret query details");
    log.mockRestore();
  });
});
