import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSalesAction, type SalesFilters } from "@/actions/sales/get-sales";
import { mapOrderToBillState } from "@/actions/sales/history";

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-1", role: "ADMIN" } }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const CAE = "12345678901234";

interface SaleFixture {
  id: string;
  date: Date;
  businessId: string;
  paidStatus: string;
  seller: string;
  paymentMethod: string | null;
  paymentMethod2: string | null;
  total: number;
  discountAmount: number;
  discountPercentage: number;
  totalMethod2: number | null;
  billType?: string | null;
  afipVoucherType: number | null;
  invoiceNumber: number | null;
  invoicePointOfSale: number | null;
  CAE: unknown;
  items: Array<Record<string, unknown>>;
  client: { name: string } | null;
  clientId: string | null;
  clientDocumentNumber: string | null;
  clientDocumentType: string | null;
  clientIvaCondition: string | null;
  returns: Array<Record<string, unknown>>;
}

const sale = (overrides: Partial<SaleFixture> = {}): SaleFixture => ({
  id: "sale-1",
  date: new Date("2026-04-20T12:00:00.000Z"),
  businessId: "business-1",
  paidStatus: "pago",
  seller: "seller@example.com",
  paymentMethod: "Efectivo",
  paymentMethod2: null,
  total: 100,
  discountAmount: 0,
  discountPercentage: 0,
  totalMethod2: null,
  afipVoucherType: null,
  invoiceNumber: 45,
  invoicePointOfSale: 3,
  CAE: { CAE },
  items: [],
  client: null,
  clientId: null,
  clientDocumentNumber: null,
  clientDocumentType: null,
  clientIvaCondition: null,
  returns: [],
  ...overrides,
});

const mapped = (input: SaleFixture) => mapOrderToBillState(input as never);

describe("historical sales fiscal classification", () => {
  it.each([
    [1, "Factura A"],
    [6, "Factura B"],
    [11, "Factura C"],
  ] as const)("recovers %s from valid CAE evidence and voucher metadata", (voucherType, expectedBillType) => {
    const result = mapped(sale({ afipVoucherType: voucherType }));

    expect(result.billType).toBe(expectedBillType);
    expect(result.CAE?.CAE).toBe(CAE);
    expect(result.ptoVenta).toBe(3);
    expect(result.originalVoucher).toMatchObject({
      billType: expectedBillType,
      afipVoucherType: voucherType,
      number: 45,
      pointOfSale: 3,
    });
  });

  it.each([
    ["JSON object", { CAE, afipVoucherType: 6 }],
    ["serialized JSON", JSON.stringify({ CAE, billType: "Factura C", afipVoucherType: 11 })],
  ])("recovers consistent type metadata from historical CAE %s", (_description, historicalCae) => {
    const expected = _description === "JSON object" ? "Factura B" : "Factura C";
    const result = mapped(sale({ CAE: historicalCae }));

    expect(result.billType).toBe(expected);
    expect(result.CAE?.CAE).toBe(CAE);
  });

  it.each([
    ["CAE alone", sale({ CAE: { CAE } })],
    ["placeholder CAE", sale({ CAE: { CAE: "SIN CAE", afipVoucherType: 1 } })],
    ["invalid CAE", sale({ CAE: { CAE: "1234", afipVoucherType: 1 } })],
    ["unsupported voucher", sale({ afipVoucherType: 3 })],
    ["conflicting scalar and JSON types", sale({ billType: "Factura A", afipVoucherType: 6 })],
    ["QR data without fiscal type", sale({ CAE: { CAE, qrData: "https://example.test/qr?type=1" } })],
  ])("does not invent a bill type from %s", (_description, fixture) => {
    expect(mapped(fixture).billType).toBeUndefined();
  });

  it("keeps an explicit Remito but does not infer Remito from absent CAE", () => {
    expect(mapped(sale({ billType: "Remito", CAE: null })).billType).toBe("Remito");
    expect(mapped(sale({ CAE: null })).billType).toBeUndefined();
    expect(mapped(sale({ billType: "Remito", CAE: { CAE, afipVoucherType: 1 } })).billType).toBeUndefined();
  });
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function matchesWhere(row: SaleFixture, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "AND") return (Array.isArray(expected) ? expected : [expected]).every((part) => matchesWhere(row, part as Record<string, unknown>));
    if (key === "OR") return Array.isArray(expected) && expected.some((part) => matchesWhere(row, part as Record<string, unknown>));
    const actual = row[key as keyof SaleFixture];
    if (!isRecord(expected)) return actual === expected;
    if ("in" in expected) return Array.isArray(expected.in) && expected.in.includes(actual);
    if ("gte" in expected && !(actual instanceof Date && expected.gte instanceof Date && actual >= expected.gte)) return false;
    if ("lte" in expected && !(actual instanceof Date && expected.lte instanceof Date && actual <= expected.lte)) return false;
    if ("lt" in expected) {
      if (actual instanceof Date && expected.lt instanceof Date) return actual < expected.lt;
      if (typeof actual === "string" && typeof expected.lt === "string") return actual < expected.lt;
      return false;
    }
    return true;
  });
}

function applyQuery(rows: SaleFixture[], args: unknown): SaleFixture[] {
  const query = args as { where: Record<string, unknown>; take: number };
  const filtered = rows.filter((row) => matchesWhere(row, query.where));
  filtered.sort((left, right) => right.date.getTime() - left.date.getTime() || right.id.localeCompare(left.id));
  return filtered.slice(0, query.take);
}

describe("getSalesAction invoice recovery and query boundaries", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it.each(["FACTURA_C", "FACTURA"] as const)("fills and continues logical invoice pages for %s across unknown and recoverable legacy candidates", async (documentType) => {
    const { db } = await import("@/lib/db");
    const candidates = [
      sale({ id: "unknown-newest", date: new Date("2026-04-23T12:00:00Z"), CAE: { CAE }, paymentMethod: "Tarjeta", paymentMethod2: "Efectivo" }),
      sale({ id: "invoice-c", date: new Date("2026-04-22T12:00:00Z"), afipVoucherType: 11 }),
      sale({ id: "invoice-b", date: new Date("2026-04-22T12:00:00Z"), afipVoucherType: 6 }),
      sale({ id: "invoice-a", date: new Date("2026-04-20T12:00:00Z"), afipVoucherType: 1 }),
      sale({ id: "other-tenant", businessId: "business-2", afipVoucherType: 1 }),
      sale({ id: "unpaid", paidStatus: "inpago", afipVoucherType: 1 }),
    ];
    vi.mocked(db.order.findMany).mockImplementation(
      ((args: unknown) => Promise.resolve(applyQuery(candidates, args))) as never,
    );
    const filters: SalesFilters = {
      documentTypes: [documentType],
      paymentMethods: ["Efectivo"],
      startDate: "2026-04-20T00:00:00.000Z",
      endDate: "2026-04-23T23:59:59.999Z",
      seller: "seller@example.com",
    };

    const first = await getSalesAction({ take: 2, filters });
    expect(first.sales.map(({ id, billType }) => [id, billType])).toEqual([
      ["unknown-newest", undefined],
      ["invoice-c", "Factura C"],
    ]);
    expect(first.nextCursor).toBeTruthy();

    const second = await getSalesAction({ take: 2, cursor: first.nextCursor ?? undefined, filters });
    expect(second.sales.map(({ id, billType }) => [id, billType])).toEqual([
      ["invoice-b", "Factura B"],
      ["invoice-a", "Factura A"],
    ]);
    expect(second.nextCursor).toBeNull();

    for (const [args] of vi.mocked(db.order.findMany).mock.calls) {
      const { where } = args as { where: Record<string, unknown> };
      expect(where).toMatchObject({ businessId: "business-1", paidStatus: "pago", seller: "seller@example.com" });
      expect(JSON.stringify(where)).toContain("paymentMethod2");
      expect(JSON.stringify(where)).toContain("2026-04-20");
    }
  });

  it("leaves unknown paid records eligible when no document filter is active", async () => {
    const { db } = await import("@/lib/db");
    const unknown = sale({ id: "unclassified", CAE: { CAE } });
    vi.mocked(db.order.findMany).mockResolvedValue([unknown] as never);

    const result = await getSalesAction({ filters: { documentTypes: [], paymentMethods: [] } });

    expect(result.sales.map(({ id }) => id)).toEqual(["unclassified"]);
    expect(result.nextCursor).toBeNull();
    expect(vi.mocked(db.order.findMany).mock.calls[0]?.[0]).toMatchObject({
      where: { businessId: "business-1", paidStatus: "pago" },
    });
  });

  it("iterates a large filtered history without omissions or duplicate legacy invoices", async () => {
    const { db } = await import("@/lib/db");
    const history = Array.from({ length: 250 }, (_, index) => {
      const recoverable = index % 7 === 0;
      const voucherType = ([1, 6, 11] as const)[Math.floor(index / 7) % 3];
      return sale({
        id: `sale-${String(index).padStart(3, "0")}`,
        date: new Date(Date.UTC(2026, 7, 1) - index * 86_400_000),
        CAE: { CAE },
        afipVoucherType: recoverable ? voucherType : null,
      });
    });
    const expectedIds = history
      .sort((left, right) => right.date.getTime() - left.date.getTime() || right.id.localeCompare(left.id))
      .map(({ id }) => id);
    vi.mocked(db.order.findMany).mockImplementation(
      ((args: unknown) => Promise.resolve(applyQuery(history, args))) as never,
    );
    const filters: SalesFilters = { documentTypes: ["FACTURA"], paymentMethods: [] };
    const actualIds: string[] = [];
    let cursor: string | undefined;
    let pages = 0;

    do {
      const page = await getSalesAction({ take: 10, cursor, filters });
      actualIds.push(...page.sales.map(({ id }) => id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
      if (!cursor) break;
    } while (pages < 30);

    expect(actualIds).toEqual(expectedIds);
    expect(new Set(actualIds).size).toBe(expectedIds.length);
    expect(pages).toBe(25);
    expect(vi.mocked(db.order.findMany).mock.calls.every(([args]) => (args as { take: number }).take <= 101)).toBe(true);
  });
});
