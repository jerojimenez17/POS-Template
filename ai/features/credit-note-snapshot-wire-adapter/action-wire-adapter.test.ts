import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, prepareMock, issueMock, billingPreflightMock, voucherLookupMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prepareMock: vi.fn(),
  issueMock: vi.fn(),
  billingPreflightMock: vi.fn(),
  voucherLookupMock: vi.fn(),
  dbMock: {
    order: { findFirst: vi.fn() },
    saleReturn: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    cashboxSession: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/server/arca-billing", () => ({
  preflightCreditNoteBillingConfiguration: billingPreflightMock,
  getVoucherNumberForActor: voucherLookupMock,
}));
vi.mock("@/lib/server/afip-voucher", () => ({
  prepareAfipVoucherForActor: prepareMock,
  issuePreparedAfipVoucher: issueMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCreditNoteAction } from "@/actions/sales/credit-note";

const request = {
  orderId: "sale-1",
  idempotencyKey: "credit-note-snapshot-wire-1",
  confirmed: true as const,
};

const issuerIvaCondition = "Responsable Inscripto";
const buyerIvaCondition = "Consumidor Final";

const cases = [
  {
    billType: "Factura A",
    originalAfipVoucherType: 1,
    creditNoteAfipType: 3,
    snapshot: {
      source: "AUTHORIZED_VOUCHER",
      version: 1,
      billType: "Factura A",
      afipVoucherType: 1,
      issuerIvaCondition,
      buyerIvaCondition,
      currency: "ARS",
      total: 121,
      net: 100,
      vat: 21,
      nonTaxed: 0,
      exempt: 0,
      otherTaxes: 0,
      iva: [{ id: 5, base: 100, amount: 21 }],
    },
    expectedBreakdown: {
      source: "AUTHORIZED_VOUCHER",
      version: 1,
      originalAfipVoucherType: 1,
      ImpTotal: 121,
      ImpNeto: 100,
      ImpIVA: 21,
      ImpTotConc: 0,
      ImpOpEx: 0,
      ImpTrib: 0,
      Iva: [{ Id: 5, BaseImp: 100, Importe: 21 }],
    },
  },
  {
    billType: "Factura B",
    originalAfipVoucherType: 6,
    creditNoteAfipType: 8,
    snapshot: {
      source: "AUTHORIZED_VOUCHER",
      version: 1,
      billType: "Factura B",
      afipVoucherType: 6,
      issuerIvaCondition,
      buyerIvaCondition,
      currency: "ARS",
      total: 121,
      net: 100,
      vat: 21,
      nonTaxed: 0,
      exempt: 0,
      otherTaxes: 0,
      iva: [{ id: 5, base: 100, amount: 21 }],
    },
    expectedBreakdown: {
      source: "AUTHORIZED_VOUCHER",
      version: 1,
      originalAfipVoucherType: 6,
      ImpTotal: 121,
      ImpNeto: 100,
      ImpIVA: 21,
      ImpTotConc: 0,
      ImpOpEx: 0,
      ImpTrib: 0,
      Iva: [{ Id: 5, BaseImp: 100, Importe: 21 }],
    },
  },
  {
    billType: "Factura C",
    originalAfipVoucherType: 11,
    creditNoteAfipType: 13,
    // A valid Factura C snapshot has no IVA groups; retain its authorized
    // total while keeping the fixture consistent with the canonical contract.
    snapshot: {
      source: "AUTHORIZED_VOUCHER",
      version: 1,
      billType: "Factura C",
      afipVoucherType: 11,
      issuerIvaCondition,
      buyerIvaCondition,
      currency: "ARS",
      total: 121,
      net: 121,
      vat: 0,
      nonTaxed: 0,
      exempt: 0,
      otherTaxes: 0,
      iva: [],
    },
    expectedBreakdown: {
      source: "AUTHORIZED_VOUCHER",
      version: 1,
      originalAfipVoucherType: 11,
      ImpTotal: 121,
      ImpNeto: 121,
      ImpIVA: 0,
      ImpTotConc: 0,
      ImpOpEx: 0,
      ImpTrib: 0,
      Iva: [],
    },
  },
] as const;

type OriginalTypeCase = (typeof cases)[number];

function orderFixture(testCase: OriginalTypeCase, overrides: Record<string, unknown> = {}) {
  return {
    id: "sale-1",
    businessId: "business-1",
    paidStatus: "pago",
    total: 121,
    discountAmount: 0,
    seller: "seller@example.test",
    billType: testCase.billType,
    afipVoucherType: testCase.originalAfipVoucherType,
    invoiceNumber: 73,
    invoicePointOfSale: 42,
    CAE: "12345678901234",
    fiscalSnapshot: testCase.snapshot,
    clientIvaCondition: buyerIvaCondition,
    clientDocumentType: "CUIT",
    clientDocumentNumber: "20123456789",
    items: [{
      id: "line-1",
      productId: "product-1",
      code: "SKU-1",
      description: "Producto con precio actual distinto del snapshot",
      quantity: 1,
      price: 999,
      costPrice: 777,
      subTotal: 999,
    }],
    returns: [],
    ...overrides,
  };
}

function capturedBillState(): Record<string, unknown> {
  const billState = prepareMock.mock.calls[0]?.[0];
  if (!billState || typeof billState !== "object") {
    throw new Error("Expected prepareAfipVoucherForActor to receive a billState");
  }
  return billState as Record<string, unknown>;
}

function configureOrder(order: ReturnType<typeof orderFixture>) {
  dbMock.order.findFirst.mockResolvedValue(order);
}

describe("createCreditNoteAction snapshot-to-wire adapter", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user-1", businessId: "business-1", role: "ADMIN", email: "actor@example.test" },
    });
    dbMock.saleReturn.findFirst.mockResolvedValue(null);
    dbMock.cashboxSession.findFirst.mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" });
    billingPreflightMock.mockResolvedValue({ success: true, emissionPointOfSale: 9 });
    // Capture exactly the server state passed to prepare, then stop before any
    // sequence lookup, reservation, or issue operation can run.
    prepareMock.mockImplementation(async () => ({
      error: "stop before issue",
      issuanceNotStarted: true,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each(cases)(
    "passes the normalized DB snapshot and original association to prepare for $billType",
    async (testCase) => {
      configureOrder(orderFixture(testCase));
      const result = await createCreditNoteAction(request);

      expect(result).toMatchObject({ success: false, code: "AFIP_ERROR", error: "stop before issue" });
      expect(prepareMock).toHaveBeenCalledTimes(1);
      expect(billingPreflightMock).toHaveBeenCalledWith({
        businessId: "business-1",
        tipoFactura: testCase.creditNoteAfipType,
      });

      const billState = capturedBillState();
      expect(billState.fiscalBreakdown).toEqual(testCase.expectedBreakdown);
      expect(billState).not.toHaveProperty("fiscalSnapshot");
      expect(billState).not.toHaveProperty("fiscalBreakdown.source", "ATTACKER");
      expect(billState).toMatchObject({
        billType: testCase.billType,
        ptoVenta: 9,
        nroAsociado: 73,
        ptoVentaAsociado: 42,
        caeAsociado: "12345678901234",
        total: 121,
        totalWithDiscount: 121,
        discount: 0,
        CbtesAsoc: [{ Tipo: testCase.originalAfipVoucherType, PtoVta: 42, Nro: 73 }],
      });

      expect(voucherLookupMock).not.toHaveBeenCalled();
      expect(issueMock).not.toHaveBeenCalled();
      expect(dbMock.$transaction).not.toHaveBeenCalled();
      expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
      expect(dbMock.saleReturn.update).not.toHaveBeenCalled();
      expect(dbMock.saleReturn.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(cases)(
    "adds the current server date without changing fiscal or association fields for $billType",
    async (testCase) => {
      const serverNow = new Date("2026-10-22T12:34:56.789Z");
      const originalSaleDate = "2024-01-01T00:00:00.000Z";
      vi.useFakeTimers();
      vi.setSystemTime(serverNow);
      configureOrder(orderFixture(testCase, { date: originalSaleDate }));

      await createCreditNoteAction(request);

      expect(prepareMock).toHaveBeenCalledTimes(1);
      const billState = capturedBillState();
      const emissionDate = billState.date;
      expect(typeof emissionDate).toBe("string");
      expect(emissionDate).not.toBe(originalSaleDate);
      expect(emissionDate).toBe(serverNow.toISOString());
      const parsedEmissionDate = new Date(emissionDate as string);
      expect(Number.isNaN(parsedEmissionDate.getTime())).toBe(false);
      expect(parsedEmissionDate.toISOString()).toBe(serverNow.toISOString());
      expect(billState.fiscalBreakdown).toEqual(testCase.expectedBreakdown);
      expect(billState.CbtesAsoc).toEqual([
        { Tipo: testCase.originalAfipVoucherType, PtoVta: 42, Nro: 73 },
      ]);
      expect(billState.ptoVenta).toBe(9);
    },
  );

  it("rejects JSON caller-supplied fiscal snapshot and breakdown instead of using them", async () => {
    configureOrder(orderFixture(cases[1]!));

    const result = await createCreditNoteAction({
      ...request,
      fiscalSnapshot: cases[0]!.snapshot,
      fiscalBreakdown: cases[0]!.expectedBreakdown,
    });

    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
    expect(prepareMock).not.toHaveBeenCalled();
    expect(billingPreflightMock).not.toHaveBeenCalled();
    expect(voucherLookupMock).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["invalid", { ...cases[1]!.snapshot, iva: [{ id: 5, base: 100, amount: 20 }] }],
  ])("rejects an %s persisted snapshot before prepare, reservation, or issue", async (_description, fiscalSnapshot) => {
    configureOrder(orderFixture(cases[1]!, { fiscalSnapshot }));

    const result = await createCreditNoteAction(request);

    expect(result).toMatchObject({
      success: false,
      code: "NOT_ELIGIBLE",
      error: expect.stringMatching(/desglose fiscal/i),
    });
    expect(prepareMock).not.toHaveBeenCalled();
    expect(billingPreflightMock).not.toHaveBeenCalled();
    expect(voucherLookupMock).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.update).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.updateMany).not.toHaveBeenCalled();
  });

  it.each(cases)(
    "rejects a persisted $billType snapshot whose total differs from order.total before any billing or issuance side effects",
    async (testCase) => {
      configureOrder(orderFixture(testCase, { total: 120 }));

      const result = await createCreditNoteAction(request);

      expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
      expect(prepareMock).not.toHaveBeenCalled();
      expect(billingPreflightMock).not.toHaveBeenCalled();
      expect(voucherLookupMock).not.toHaveBeenCalled();
      expect(issueMock).not.toHaveBeenCalled();
      expect(dbMock.$transaction).not.toHaveBeenCalled();
      expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
      expect(dbMock.saleReturn.update).not.toHaveBeenCalled();
      expect(dbMock.saleReturn.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(cases)(
    "rejects persisted $billType metadata when original afipVoucherType contradicts billType before any billing or issuance side effects",
    async (testCase) => {
      const contradictoryOriginalType = testCase.billType === "Factura A" ? 6 : 1;
      configureOrder(orderFixture(testCase, { afipVoucherType: contradictoryOriginalType }));

      const result = await createCreditNoteAction(request);

      expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
      expect(prepareMock).not.toHaveBeenCalled();
      expect(billingPreflightMock).not.toHaveBeenCalled();
      expect(voucherLookupMock).not.toHaveBeenCalled();
      expect(issueMock).not.toHaveBeenCalled();
      expect(dbMock.$transaction).not.toHaveBeenCalled();
      expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
      expect(dbMock.saleReturn.update).not.toHaveBeenCalled();
      expect(dbMock.saleReturn.updateMany).not.toHaveBeenCalled();
    },
  );
});
