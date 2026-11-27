import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, prepareMock, issueMock, preflightMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prepareMock: vi.fn(),
  issueMock: vi.fn(),
  preflightMock: vi.fn(),
  dbMock: {
    order: { findFirst: vi.fn() },
    saleReturn: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    cashboxSession: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/server/afip-voucher", () => ({
  prepareAfipVoucherForActor: prepareMock,
  issuePreparedAfipVoucher: issueMock,
}));
vi.mock("@/lib/server/arca-billing", () => ({ preflightCreditNoteBillingConfiguration: preflightMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCreditNoteAction } from "@/actions/sales/credit-note";

const snapshot = {
  version: 1,
  source: "AUTHORIZED_VOUCHER",
  billType: "Factura A",
  afipVoucherType: 1,
  issuerIvaCondition: "Responsable Inscripto",
  buyerIvaCondition: "Responsable Inscripto",
  currency: "ARS",
  total: 121,
  net: 100,
  vat: 21,
  nonTaxed: 0,
  exempt: 0,
  otherTaxes: 0,
  iva: [{ id: 5, base: 100, amount: 21 }],
};

const actor = { id: "actor-1", businessId: "tenant-1", role: "ADMIN", email: "qa@example.test" };
const request = { orderId: "sale-1", confirmed: true, idempotencyKey: "request-1" };
let order: Record<string, unknown>;
let savedReturn: Record<string, unknown>;

function resetOrder(fiscalSnapshot: unknown = snapshot): void {
  order = {
    id: "sale-1",
    businessId: "tenant-1",
    paidStatus: "pago",
    total: 121,
    discountPercentage: 10,
    billType: "Factura A",
    afipVoucherType: 1,
    invoiceNumber: 45,
    invoicePointOfSale: 3,
    CAE: "12345678901234",
    fiscalSnapshot,
    clientIvaCondition: "Consumidor Final",
    items: [{ id: "line-1", productId: "sku-1", code: "SKU-1", description: "Changed catalog", quantity: 1, price: 999, costPrice: 500, subTotal: 999 }],
    returns: [],
  };
}

function setupMocks(): void {
  savedReturn = {
    id: "return-1", kind: "CREDIT_NOTE", status: "PENDING", idempotencyKey: request.idempotencyKey,
    creditNoteCAE: null, creditNoteNumber: null, creditNotePointOfSale: null,
  };
  resetOrder();
  authMock.mockResolvedValue({ user: actor });
  preflightMock.mockResolvedValue({ success: true, emissionPointOfSale: 9 });
  prepareMock.mockResolvedValue({ success: true, prepared: { opaque: true } });
  issueMock.mockResolvedValue({ success: true, data: { cae: "98765432101234", nroComprobante: 77, ptoVenta: 9 } });
  dbMock.order.findFirst.mockImplementation(async () => order);
  dbMock.saleReturn.findFirst.mockResolvedValue(null);
  dbMock.saleReturn.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(savedReturn, data);
    return savedReturn;
  });
  dbMock.saleReturn.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(savedReturn, data);
    return savedReturn;
  });
  dbMock.saleReturn.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(savedReturn, data);
    return { count: 1 };
  });
  dbMock.cashboxSession.findFirst.mockResolvedValue({ id: "cash-session-1", cashboxId: "cashbox-1" });
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: "sale-1" }]),
    order: { findFirst: vi.fn(async () => ({ ...order, returns: [] })) },
    business: { findUnique: vi.fn(async () => ({ id: "tenant-1", ptoVenta: [9] })) },
    saleReturn: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(savedReturn, data);
        return savedReturn;
      }),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(savedReturn, data);
        return { count: 1 };
      }),
      findUnique: vi.fn(async () => savedReturn),
    },
    cashboxSession: { findFirst: vi.fn(async () => ({ id: "cash-session-1", cashboxId: "cashbox-1" })) },
    saleReturnItem: { createMany: vi.fn(async () => ({ count: 1 })) },
    product: { update: vi.fn(async () => ({})) },
    stockMovement: { createMany: vi.fn(async () => ({ count: 1 })) },
    cashBox: { update: vi.fn(async () => ({})) },
    cashMovement: { create: vi.fn(async () => ({})) },
  };
  dbMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
}

describe("credit-note checkout snapshot boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("loads the invoice and its fiscal snapshot from the authenticated tenant, never from caller amounts", async () => {
    const result = await createCreditNoteAction({
      ...request,
      fiscalBreakdown: { ImpNeto: 1, ImpIVA: 0, Iva: [] },
      total: 1,
      discount: 99,
    });

    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
    expect(dbMock.order.findFirst).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("rejects a paid historical sale without a complete snapshot before reservation and emission", async () => {
    resetOrder(null);

    const result = await createCreditNoteAction(request);

    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
    expect(dbMock.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sale-1", businessId: "tenant-1" },
    }));
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.updateMany).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("uses the persisted post-discount fiscal groups despite changed products and current IVA condition", async () => {
    const result = await createCreditNoteAction(request);

    expect(dbMock.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sale-1", businessId: "tenant-1" },
      include: expect.objectContaining({ items: true, returns: true }),
    }));
    expect(prepareMock).toHaveBeenCalledTimes(1);
    const preparedState = prepareMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(preparedState.fiscalBreakdown).toEqual({
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
    });
    expect(preparedState).not.toHaveProperty("fiscalSnapshot");
    expect(preparedState).toMatchObject({
      billType: "Factura A",
      total: 121,
      totalWithDiscount: 121,
      discount: 0,
      IVACondition: "Consumidor Final",
      nroAsociado: 45,
      ptoVentaAsociado: 3,
      caeAsociado: "12345678901234",
      CbtesAsoc: [{ Tipo: 1, PtoVta: 3, Nro: 45 }],
    });
    expect(result).toMatchObject({ success: true, data: { creditNoteCAE: "98765432101234" } });
  });

  it.each([
    ["unknown version", { ...snapshot, version: 7 }],
    ["total mismatch", { ...snapshot, total: 120 }],
    ["type mismatch", { ...snapshot, billType: "Factura B", afipVoucherType: 6 }],
    ["net without IVA groups", { ...snapshot, iva: [] }],
  ])("rejects %s before a new reservation or createVoucher call", async (_case, invalidSnapshot) => {
    resetOrder(invalidSnapshot);

    const result = await createCreditNoteAction(request);

    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.updateMany).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("returns an already-authorized result for the same key without reserving or emitting again", async () => {
    order.returns = [{
      id: "return-existing", kind: "CREDIT_NOTE", status: "AUTHORIZED",
      idempotencyKey: request.idempotencyKey, creditNoteCAE: "98765432101234",
      creditNoteNumber: 77, creditNotePointOfSale: 9,
    }];

    const result = await createCreditNoteAction(request);

    expect(result).toMatchObject({ success: true, data: { creditNoteCAE: "98765432101234" } });
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("keeps an uncertain emission pending and does not automatically issue on a retry", async () => {
    issueMock.mockRejectedValueOnce(new Error("network timeout after request started"));

    const firstResult = await createCreditNoteAction(request);
    expect(firstResult).toMatchObject({ success: false, pending: true, code: "PENDING" });
    expect(issueMock).toHaveBeenCalledTimes(1);

    order.returns = [savedReturn as never];
    const retryResult = await createCreditNoteAction(request);

    expect(retryResult).toMatchObject({ success: false, pending: true, code: "PENDING" });
    expect(issueMock).toHaveBeenCalledTimes(1);
    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
