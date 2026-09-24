import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, anchorLookupMock, findManyMock, mapperMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  anchorLookupMock: vi.fn(),
  findManyMock: vi.fn(),
  mapperMock: vi.fn((order: { id: string }) => ({ id: order.id })),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  db: {
    order: {
      findMany: findManyMock,
      // Keep both common Prisma lookup methods on the same deterministic spy.
      findFirst: anchorLookupMock,
      findUnique: anchorLookupMock,
    },
  },
}));
vi.mock("@/actions/sales/history", () => ({ mapOrderToBillState: mapperMock }));

import { getSalesAction } from "@/actions/sales/get-sales";

interface FixtureOrder {
  id: string;
  businessId: string;
  paidStatus: string;
  date: Date;
}

interface CursorWhere {
  OR?: Array<Record<string, unknown>>;
}

interface CandidateQuery {
  where: CursorWhere;
  take: number;
}

const BUSINESS_ID = "business-a";
const CURSOR_ID = "sale-row-8";
const CURSOR_DATE = new Date("2026-05-10T12:00:00.000Z");

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;

function isAfterCursor(row: FixtureOrder, clauses: Array<Record<string, unknown>>): boolean {
  return clauses.some((clause) => {
    const dateCondition = clause.date;
    const dateRecord = asRecord(dateCondition);
    if (!dateRecord) return false;

    if (dateRecord.lt instanceof Date) return row.date < dateRecord.lt;

    const lower = dateRecord.gte instanceof Date ? dateRecord.gte : undefined;
    const upper = dateRecord.lte instanceof Date ? dateRecord.lte : undefined;
    const idCondition = asRecord(clause.id);
    if (lower && upper && row.date >= lower && row.date <= upper
      && typeof idCondition?.lt === "string") {
      return row.date.getTime() === lower.getTime() && row.id < idCondition.lt;
    }

    // The equality form is accepted by Prisma's current keyset query contract.
    if (dateCondition instanceof Date && row.date.getTime() === dateCondition.getTime()
      && typeof idCondition?.lt === "string") {
      return row.id < idCondition.lt;
    }
    return false;
  });
}

describe("getSalesAction legacy raw-ID cursor compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { businessId: BUSINESS_ID } });
    anchorLookupMock.mockReset();
    findManyMock.mockReset().mockResolvedValue([]);
    mapperMock.mockClear();
  });

  it("resolves a scoped legacy anchor and pages strictly in stable date/id order", async () => {
    const priorDate = new Date("2026-05-09T12:00:00.000Z");
    const rows: FixtureOrder[] = [
      { id: "sale-row-9", businessId: BUSINESS_ID, paidStatus: "pago", date: CURSOR_DATE },
      { id: CURSOR_ID, businessId: BUSINESS_ID, paidStatus: "pago", date: CURSOR_DATE },
      { id: "sale-row-7", businessId: BUSINESS_ID, paidStatus: "pago", date: CURSOR_DATE },
      { id: "sale-row-6", businessId: BUSINESS_ID, paidStatus: "pago", date: CURSOR_DATE },
      { id: "sale-row-5", businessId: BUSINESS_ID, paidStatus: "pago", date: priorDate },
      { id: "sale-row-2", businessId: BUSINESS_ID, paidStatus: "pago", date: priorDate },
    ];
    anchorLookupMock.mockResolvedValue({ id: CURSOR_ID, date: CURSOR_DATE });
    findManyMock.mockImplementation(async (query: CandidateQuery) => {
      const clauses = query.where.OR ?? [];
      return rows
        .filter((row) => row.businessId === BUSINESS_ID && row.paidStatus === "pago")
        .filter((row) => isAfterCursor(row, clauses))
        .sort((left, right) => right.date.getTime() - left.date.getTime() || right.id.localeCompare(left.id))
        .slice(0, query.take);
    });

    const firstPage = await getSalesAction({ cursor: CURSOR_ID, take: 2 });
    expect(firstPage.sales.map((sale) => sale.id)).toEqual(["sale-row-7", "sale-row-6"]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const emittedCursor = JSON.parse(Buffer.from(firstPage.nextCursor!, "base64url").toString("utf8")) as Record<string, unknown>;
    expect(Object.keys(emittedCursor).sort()).toEqual(["date", "id"]);
    expect(emittedCursor).toEqual({ date: CURSOR_DATE.toISOString(), id: "sale-row-6" });

    const secondPage = await getSalesAction({ cursor: firstPage.nextCursor!, take: 2 });
    const concatenatedIds = [...firstPage.sales, ...secondPage.sales].map((sale) => sale.id);
    expect(secondPage.sales.map((sale) => sale.id)).toEqual(["sale-row-5", "sale-row-2"]);
    expect(secondPage.nextCursor).toBeNull();
    expect(concatenatedIds).toEqual(["sale-row-7", "sale-row-6", "sale-row-5", "sale-row-2"]);
    expect(new Set(concatenatedIds).size).toBe(concatenatedIds.length);

    expect(anchorLookupMock).toHaveBeenCalledTimes(1);
    expect(anchorLookupMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: CURSOR_ID, businessId: BUSINESS_ID }),
    }));
    expect(findManyMock.mock.calls[0][0].where.OR).toEqual([
      { date: { lt: CURSOR_DATE } },
      { date: { gte: CURSOR_DATE, lte: CURSOR_DATE }, id: { lt: CURSOR_ID } },
    ]);
    for (const [query] of findManyMock.mock.calls) {
      expect(query.where).toMatchObject({ businessId: BUSINESS_ID, paidStatus: "pago" });
    }
  });

  it.each([
    ["belongs only to another business", true],
    ["does not exist", false],
  ])("fails safely when the raw cursor anchor %s", async (_scenario, existsInOtherBusiness) => {
    anchorLookupMock.mockImplementation(async (query: { where?: Record<string, unknown> }) => {
      if (existsInOtherBusiness && query.where?.id === CURSOR_ID && !query.where.businessId) {
        return { id: CURSOR_ID, date: CURSOR_DATE, businessId: "business-b" };
      }
      return null;
    });

    await expect(getSalesAction({ cursor: CURSOR_ID, take: 2 })).resolves.toEqual({
      sales: [],
      nextCursor: null,
    });
    expect(anchorLookupMock).toHaveBeenCalledTimes(1);
    expect(anchorLookupMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: CURSOR_ID, businessId: BUSINESS_ID }),
    }));
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
