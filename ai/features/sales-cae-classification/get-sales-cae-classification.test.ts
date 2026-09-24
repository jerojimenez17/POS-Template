import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, findManyMock, mapperMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findManyMock: vi.fn(),
  mapperMock: vi.fn((order: { id: string; billType?: unknown; CAE?: unknown }) => ({
    id: order.id,
    billType: order.billType,
    CAE: order.CAE,
  })),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { order: { findMany: findManyMock } } }));
vi.mock("@/actions/sales/history", () => ({ mapOrderToBillState: mapperMock }));

import { getSalesAction } from "@/actions/sales/get-sales";

const VALID_CAE = "71234567890123";
const date = new Date("2026-01-15T12:00:00.000Z");

const sale = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  businessId: "business-a",
  paidStatus: "pago",
  date,
  CAE: { CAE: VALID_CAE, nroComprobante: 42, ptoVenta: 7 },
  ...overrides,
});

const getByDocumentType = (rows: ReturnType<typeof sale>[], documentType: "FACTURA" | "FACTURA_C" | "REMITO") => {
  findManyMock.mockResolvedValueOnce(rows);
  return getSalesAction({ filters: { documentTypes: [documentType], paymentMethods: [] } });
};

describe("sales search classification by valid CAE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { businessId: "business-a" } });
    findManyMock.mockReset().mockResolvedValue([]);
  });

  it("does not constrain the persisted billType and returns every matching paid invoice candidate", async () => {
    const candidates = [
      sale("remito-type-with-cae", { billType: "Remito" }),
      sale("null-type-with-cae", { billType: null }),
      sale("unsupported-type-with-cae", { billType: "Presupuesto" }),
      sale("conflicting-type-with-cae", { billType: "Factura A", afipVoucherType: 6 }),
      sale("invoice-a", { billType: "Factura A", afipVoucherType: 1 }),
      sale("invoice-b", { billType: "Factura B", afipVoucherType: 6 }),
      sale("invoice-c", { billType: "Factura C", afipVoucherType: 11 }),
    ] as ReturnType<typeof sale>[];

    const result = await getByDocumentType(candidates, "FACTURA_C");
    const query = findManyMock.mock.calls[0][0];

    expect(query.where).not.toHaveProperty("billType");
    expect(query.where).not.toHaveProperty("afipVoucherType");
    expect(query.where).toMatchObject({ businessId: "business-a", paidStatus: "pago" });
    expect(result.sales.map((row) => row.id)).toEqual(candidates.map((row) => row.id));
  });

  it("returns both CAE presentation classes when document and payment filters are empty", async () => {
    const candidates = [
      sale("valid-cae-with-remito-type", { billType: "Remito" }),
      sale("no-valid-cae-with-invoice-type", { CAE: null, billType: "Factura B", afipVoucherType: 6 }),
    ];
    findManyMock.mockResolvedValueOnce(candidates);

    const result = await getSalesAction({
      filters: { documentTypes: [], paymentMethods: [] },
    });
    const query = findManyMock.mock.calls[0][0];

    expect(query.where).toEqual({ businessId: "business-a", paidStatus: "pago" });
    expect(result.sales.map((row) => row.id)).toEqual([
      "valid-cae-with-remito-type",
      "no-valid-cae-with-invoice-type",
    ]);
  });

  it.each([
    ["Remito", undefined],
    [null, undefined],
    ["Presupuesto", undefined],
    ["Factura A", 6],
    ["Factura B", 11],
    ["Factura C", 1],
  ] as const)("classifies valid CAE as Factura regardless of billType=%s and voucher=%s", async (billType, afipVoucherType) => {
    const candidate = sale("valid-cae", { billType, afipVoucherType });

    const invoices = await getByDocumentType([candidate], "FACTURA");
    expect(invoices.sales.map((row) => row.id)).toEqual([candidate.id]);

    const remitos = await getByDocumentType([candidate], "REMITO");
    expect(remitos.sales).toEqual([]);
  });

  it.each([
    ["Factura A", 1],
    ["Factura B", 6],
    ["Factura C", 11],
    ["Presupuesto", 99],
    [null, null],
  ] as const)("classifies a sale without valid CAE as Remito regardless of billType=%s", async (billType, afipVoucherType) => {
    const candidate = sale("no-cae", { CAE: null, billType, afipVoucherType });

    const remitos = await getByDocumentType([candidate], "REMITO");
    expect(remitos.sales.map((row) => row.id)).toEqual([candidate.id]);

    const invoices = await getByDocumentType([candidate], "FACTURA_C");
    expect(invoices.sales).toEqual([]);
  });

  it.each([
    ["null", null],
    ["missing", undefined],
    ["empty string", ""],
    ["whitespace", "   "],
    ["placeholder null", "null"],
    ["placeholder undefined", "undefined"],
    ["placeholder SIN CAE", "SIN CAE"],
    ["placeholder sin dato", "sin dato"],
    ["placeholder text", "placeholder CAE"],
    ["malformed non-14-digit value", "1234567890123"],
    ["non-numeric value", "71234567890ABC"],
    ["malformed JSON", "{not-json"],
    ["QR-only metadata", { qrData: "https://arca.example/qr", nroComprobante: 42, ptoVenta: 7 }],
  ] as const)("treats %s as absent CAE evidence without throwing", async (_label, persistedCAE) => {
    const candidate = sale("invalid-cae", {
      CAE: persistedCAE,
      billType: "Factura B",
      afipVoucherType: 6,
    });

    const remitos = await getByDocumentType([candidate], "REMITO");
    expect(remitos.sales.map((row) => row.id)).toEqual([candidate.id]);

    const invoices = await getByDocumentType([candidate], "FACTURA");
    expect(invoices.sales).toEqual([]);
  });

  it("scans past a raw batch while retaining business, paid, seller, payment, and date constraints", async () => {
    const skippedInvoices = Array.from({ length: 50 }, (_, index) => sale(`invoice-${index}`, {
      billType: "Factura B",
      afipVoucherType: 6,
      date: new Date(date.getTime() - index),
    }));
    const laterRemito = sale("later-remito", {
      CAE: null,
      billType: "Factura B",
      afipVoucherType: 6,
      date: new Date(date.getTime() - 100),
    });
    const finalRemito = sale("final-remito", {
      CAE: null,
      billType: "Factura C",
      afipVoucherType: 11,
      date: new Date(date.getTime() - 200),
    });
    findManyMock
      .mockResolvedValueOnce(skippedInvoices)
      .mockResolvedValueOnce([laterRemito, finalRemito]);

    const filters = {
      documentTypes: ["REMITO" as const],
      paymentMethods: ["efectivo"],
      seller: "seller-a",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-01-31T23:59:59.999Z",
    };
    const result = await getSalesAction({ take: 1, filters: { ...filters } });

    expect(findManyMock).toHaveBeenCalledTimes(2);
    expect(result.sales.map((row) => row.id)).toEqual([laterRemito.id]);
    expect(result.nextCursor).toEqual(expect.any(String));
    for (const [query] of findManyMock.mock.calls) {
      expect(query.where).toMatchObject({
        businessId: "business-a",
        paidStatus: "pago",
        seller: "seller-a",
        date: { gte: new Date("2026-01-01T00:00:00.000Z"), lte: new Date("2026-01-31T23:59:59.999Z") },
      });
      expect(query.where.AND).toEqual([{
        OR: [
          { paymentMethod: { in: ["Efectivo"] } },
          { paymentMethod2: { in: ["Efectivo"] } },
        ],
      }]);
      expect(query.where).not.toHaveProperty("billType");
    }

    findManyMock.mockResolvedValueOnce([finalRemito]);
    const nextPage = await getSalesAction({ cursor: result.nextCursor ?? undefined, take: 1, filters: { ...filters } });
    expect(nextPage.sales.map((row) => row.id)).toEqual([finalRemito.id]);
    expect(nextPage.nextCursor).toBeNull();
    expect(findManyMock.mock.calls[2][0].where.OR).toEqual([
      { date: { lt: laterRemito.date } },
      { date: { gte: laterRemito.date, lte: laterRemito.date }, id: { lt: laterRemito.id } },
    ]);
    expect(findManyMock.mock.calls[2][0].where).toMatchObject({
      businessId: "business-a",
      paidStatus: "pago",
      seller: "seller-a",
    });
  });
});
