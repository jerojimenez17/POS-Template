import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, businessFindUniqueMock, movementFindManyMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  businessFindUniqueMock: vi.fn(),
  movementFindManyMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  db: {
    business: { findUnique: businessFindUniqueMock },
    cashMovement: { findMany: movementFindManyMock },
  },
}));

interface MovementRow {
  id: string;
  total: number;
  seller: string | null;
  paidMethod: string | null;
  date: Date;
}

interface FilteredMovementResult {
  success: boolean;
  movements?: MovementRow[];
  total?: number;
  error?: string;
}

interface MovementFilters {
  fromDate?: string;
  toDate?: string;
  paymentMethod: "CASH" | "ALL";
}

interface MovementsActionModule {
  getFilteredMovements: (filters: MovementFilters) => Promise<FilteredMovementResult>;
}

const movement = (id: string, total: number, paidMethod: string | null = "Efectivo"): MovementRow => ({
  id,
  total,
  seller: "seller@example.test",
  paidMethod,
  date: new Date("2026-03-08T16:00:00.000Z"),
});

import * as movementsActions from "@/actions/movements";

const action = movementsActions as unknown as MovementsActionModule;

describe("getFilteredMovements server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { businessId: "business-a" } });
    businessFindUniqueMock.mockResolvedValue({ timezone: "America/New_York" });
    movementFindManyMock.mockResolvedValue([]);
  });

  it.each([null, { user: {} }, { user: { businessId: "" } }])(
    "rejects a session without a business and never queries movement data (%j)",
    async (session) => {
      authMock.mockResolvedValueOnce(session);

      const result = await action.getFilteredMovements({ paymentMethod: "ALL" });

      expect(result.success).toBe(false);
      expect(movementFindManyMock).not.toHaveBeenCalled();
      expect(businessFindUniqueMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { paymentMethod: "cash" },
    { paymentMethod: "Efectivo" },
    { paymentMethod: "ALL", fromDate: "2026-2-03" },
    { paymentMethod: "ALL", toDate: "2026-02-30" },
    { paymentMethod: "ALL", fromDate: "2026-02-03T00:00:00Z" },
    { paymentMethod: "ALL", fromDate: "2026-02-04", toDate: "2026-02-03" },
  ])("rejects malformed filters before querying movements: %j", async (filters) => {
    const result = await action.getFilteredMovements(filters as MovementFilters);

    expect(result.success).toBe(false);
    expect(movementFindManyMock).not.toHaveBeenCalled();
  });

  it("uses business timezone calendar boundaries as inclusive start and exclusive next-day start across DST", async () => {
    await action.getFilteredMovements({
      fromDate: "2026-03-08",
      toDate: "2026-03-08",
      paymentMethod: "ALL",
    });

    expect(businessFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "business-a" },
    }));
    const query = movementFindManyMock.mock.calls[0][0];
    expect(query.where.businessId).toBe("business-a");
    expect(query.where.date).toEqual({
      gte: new Date("2026-03-08T05:00:00.000Z"),
      lt: new Date("2026-03-09T04:00:00.000Z"),
    });
    expect(query.orderBy).toEqual([{ date: "desc" }, { id: "desc" }]);
    expect(query.select).toEqual({ id: true, total: true, seller: true, paidMethod: true, date: true });
  });

  it.each([
    [
      { fromDate: "2026-03-08", paymentMethod: "ALL" as const },
      { gte: new Date("2026-03-08T05:00:00.000Z") },
    ],
    [
      { toDate: "2026-03-08", paymentMethod: "ALL" as const },
      { lt: new Date("2026-03-09T04:00:00.000Z") },
    ],
    [{ paymentMethod: "ALL" as const }, undefined],
  ])("supports partial and empty date ranges: %j", async (filters, expectedDate) => {
    await action.getFilteredMovements(filters);

    expect(movementFindManyMock.mock.calls[0][0].where.date).toEqual(expectedDate);
  });

  it.each([null, "not/a-time-zone"])("falls back to the default business timezone when timezone is %s", async (timezone) => {
    businessFindUniqueMock.mockResolvedValueOnce({ timezone });

    await action.getFilteredMovements({
      fromDate: "2026-01-01",
      toDate: "2026-01-01",
      paymentMethod: "ALL",
    });

    expect(movementFindManyMock.mock.calls[0][0].where.date).toEqual({
      gte: new Date("2026-01-01T03:00:00.000Z"),
      lt: new Date("2026-01-02T03:00:00.000Z"),
    });
  });

  it("scopes every read to the authenticated tenant, not a client-supplied tenant", async () => {
    const forgedInput = {
      fromDate: "2026-03-08",
      paymentMethod: "CASH",
      businessId: "business-b",
      timezone: "Pacific/Kiritimati",
    } as MovementFilters;

    await action.getFilteredMovements(forgedInput);

    expect(businessFindUniqueMock.mock.calls[0][0].where.id).toBe("business-a");
    expect(movementFindManyMock.mock.calls[0][0].where.businessId).toBe("business-a");
    expect(movementFindManyMock.mock.calls[0][0].where.paidMethod).toBe("Efectivo");
  });

  it("uses the exact Efectivo discriminator for CASH and no method predicate for ALL", async () => {
    await action.getFilteredMovements({ paymentMethod: "CASH" });
    expect(movementFindManyMock.mock.calls[0][0].where.paidMethod).toBe("Efectivo");

    movementFindManyMock.mockClear();
    await action.getFilteredMovements({ paymentMethod: "ALL" });
    expect(movementFindManyMock.mock.calls[0][0].where).not.toHaveProperty("paidMethod");
  });

  it("returns all filtered movement rows and sums individually rounded signed pesos", async () => {
    const rows = [
      movement("ten-49", 10.49),
      movement("another-ten-49", 10.49),
      movement("ten-50", 10.5),
      movement("withdrawal", -2.5),
      movement("return", -3.49),
      movement("sub-half", 0.49),
    ];
    movementFindManyMock.mockResolvedValueOnce(rows);

    const result = await action.getFilteredMovements({ paymentMethod: "CASH" });

    expect(result).toMatchObject({ success: true, movements: rows, total: 25 });
    expect(result.total).toBe(result.movements?.reduce((sum, row) => sum + Math.sign(row.total) * Math.floor(Math.abs(row.total) + 0.5), 0));
    expect(result.total).not.toBe(Math.round(rows.reduce((sum, row) => sum + row.total, 0)));
  });

  it("returns a zero subtotal for an empty successful query", async () => {
    movementFindManyMock.mockResolvedValueOnce([]);

    await expect(action.getFilteredMovements({ paymentMethod: "ALL" })).resolves.toMatchObject({
      success: true,
      movements: [],
      total: 0,
    });
  });

  it("distinguishes a database failure from an empty result without leaking database details", async () => {
    movementFindManyMock.mockRejectedValueOnce(new Error("private Prisma table and SQL details"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await action.getFilteredMovements({ paymentMethod: "ALL" });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).not.toMatch(/Prisma|SQL|private/i);
    expect(result).not.toMatchObject({ movements: [], total: 0 });
    expect(errorSpy).toHaveBeenCalled();
  });
});
