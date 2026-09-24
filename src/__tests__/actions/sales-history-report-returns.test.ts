import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDailyReportAction } from "@/actions/sales/history";

const { authMock, orderFindManyMock, saleReturnFindManyMock, stockMovementFindManyMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  orderFindManyMock: vi.fn(),
  saleReturnFindManyMock: vi.fn(),
  stockMovementFindManyMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  db: {
    order: { findMany: orderFindManyMock },
    saleReturn: { findMany: saleReturnFindManyMock },
    stockMovement: { findMany: stockMovementFindManyMock },
  },
}));

const windowStart = new Date("2026-06-15T00:00:00.000Z");
const returnRows = [
  { kind: "MANUAL_RETURN", status: "PENDING", total: 10 },
  { kind: "MANUAL_RETURN", status: "AUTHORIZED", total: 20 },
  { kind: "MANUAL_RETURN", status: "REJECTED", total: 999 },
  { kind: "CREDIT_NOTE", status: "AUTHORIZED", total: 30 },
  { kind: "CREDIT_NOTE", status: "PENDING", total: 888 },
  { kind: "CREDIT_NOTE", status: "REJECTED", total: 777 },
];

describe("daily report return kind/status treatment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1", businessId: "business-1", role: "ADMIN" } });
    orderFindManyMock.mockResolvedValue([]);
    saleReturnFindManyMock.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      return returnRows.filter((row) => {
        const kind = where.kind;
        const status = where.status;
        const kindMatches = typeof kind === "string" ? row.kind === kind : true;
        const statusMatches = typeof status === "string" ? row.status === status : true;
        const alternatives = where.OR as Array<Record<string, unknown>> | undefined;
        const alternativeMatches = alternatives
          ? alternatives.some((condition) => condition.kind === row.kind
            && ((condition.status as { in?: string[] } | undefined)?.in?.includes(row.status) ?? condition.status === row.status))
          : true;
        return kindMatches && statusMatches && alternativeMatches;
      });
    });
    stockMovementFindManyMock.mockResolvedValue([]);
  });

  it("fails closed on a direct unauthenticated report call without querying tenant data", async () => {
    authMock.mockResolvedValue(null);

    const result = await getDailyReportAction(windowStart);

    expect(result).toEqual({ error: "No autorizado" });
    expect(orderFindManyMock).not.toHaveBeenCalled();
    expect(saleReturnFindManyMock).not.toHaveBeenCalled();
    expect(stockMovementFindManyMock).not.toHaveBeenCalled();
  });

  it("includes committed manual returns and only authorized credit notes exactly once", async () => {
    const result = await getDailyReportAction(windowStart);

    expect(result).toMatchObject({
      success: true,
      data: { totalReturns: 60, netTotal: -60, returnCount: 3 },
    });
    const query = saleReturnFindManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(query.where).toMatchObject({
      businessId: "business-1",
      date: { gte: expect.any(Date), lte: expect.any(Date) },
    });
    expect(JSON.stringify(query.where)).toContain("MANUAL_RETURN");
    expect(JSON.stringify(query.where)).toContain("CREDIT_NOTE");
    expect(JSON.stringify(query.where)).toContain("PENDING");
    expect(JSON.stringify(query.where)).toContain("AUTHORIZED");
    expect(JSON.stringify(query.where)).toContain("REJECTED");
  });

  it("applies the authenticated business and the same requested date window", async () => {
    const endDate = new Date("2026-06-16T14:30:00.000Z");

    await getDailyReportAction(windowStart, endDate);

    const query = saleReturnFindManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(query.where.businessId).toBe("business-1");
    expect(query.where.date).toMatchObject({ gte: expect.any(Date), lte: expect.any(Date) });
    const dateWindow = query.where.date as { gte: Date; lte: Date };
    const expectedStart = new Date(windowStart);
    expectedStart.setHours(0, 0, 0, 0);
    const expectedEnd = new Date(endDate);
    expectedEnd.setHours(23, 59, 59, 999);
    expect(dateWindow.gte).toEqual(expectedStart);
    expect(dateWindow.lte).toEqual(expectedEnd);
  });
});
