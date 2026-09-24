import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, prepareMock, issueMock, preflightMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prepareMock: vi.fn(),
  issueMock: vi.fn(),
  preflightMock: vi.fn(),
  dbMock: {
    business: { findUnique: vi.fn() },
    order: { findFirst: vi.fn() },
    saleReturn: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    cashboxSession: { findFirst: vi.fn() },
    saleReturnItem: { createMany: vi.fn() },
    product: { update: vi.fn() },
    stockMovement: { createMany: vi.fn() },
    cashBox: { update: vi.fn() },
    cashMovement: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/server/arca-billing", () => ({ preflightCreditNoteBillingConfiguration: preflightMock }));
vi.mock("@/lib/server/afip-voucher", () => ({
  prepareAfipVoucherForActor: prepareMock,
  issuePreparedAfipVoucher: issueMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

interface CreditNoteActionModule {
  createCreditNoteAction: (input: {
    orderId: string;
    idempotencyKey: string;
    confirmed: boolean;
  }) => Promise<Record<string, unknown>>;
}

const actionModulePath = "@/actions/sales/credit-note";
const loadAction = async () =>
  (await import(/* @vite-ignore */ actionModulePath)) as unknown as CreditNoteActionModule;

const validInput = { orderId: "order-1", idempotencyKey: "retry-1", confirmed: true };
const authorizedFiscalSnapshot = {
  version: 1,
  source: "AUTHORIZED_VOUCHER",
  billType: "Factura B",
  afipVoucherType: 6,
  issuerIvaCondition: "Responsable Inscripto",
  buyerIvaCondition: "Consumidor Final",
  currency: "ARS",
  total: 120,
  net: 100,
  vat: 20,
  nonTaxed: 0,
  exempt: 0,
  otherTaxes: 0,
  iva: [{ id: 5, base: 100, amount: 20 }],
} as const;

const authorizedReturn = {
  id: "return-1",
  kind: "CREDIT_NOTE",
  status: "PENDING" as "PENDING" | "AUTHORIZED" | "REJECTED",
  idempotencyKey: "retry-1",
  creditNoteCAE: null as string | null,
  creditNoteNumber: null as number | null,
  creditNotePointOfSale: null as number | null,
};

const financialEffects = [
  dbMock.saleReturnItem.createMany,
  dbMock.product.update,
  dbMock.stockMovement.createMany,
  dbMock.cashBox.update,
  dbMock.cashMovement.create,
];

function validOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    businessId: "business-1",
    paidStatus: "pago",
    total: 120,
    CAE: { CAE: "ORIGINAL-CAE" },
    billType: "Factura B",
    afipVoucherType: 6,
    invoiceNumber: 1234,
    invoicePointOfSale: 7,
    items: [{ id: "line-1", productId: "p1", code: "P1", description: "Producto", quantity: 1.5, price: 80, subTotal: 120 }],
    fiscalSnapshot: authorizedFiscalSnapshot,
    saleReturns: [],
    ...overrides,
  };
}

describe("createCreditNoteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(authorizedReturn, {
      id: "return-1",
      kind: "CREDIT_NOTE",
      status: "PENDING",
      idempotencyKey: "retry-1",
      creditNoteCAE: null,
      creditNoteNumber: null,
      creditNotePointOfSale: null,
    });
    authMock.mockResolvedValue({ user: { id: "user-1", businessId: "business-1", role: "ADMIN" } });
    dbMock.business.findUnique.mockResolvedValue({ id: "business-1", ptoVenta: [9] });
    dbMock.cashboxSession.findFirst.mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" });
    dbMock.order.findFirst.mockResolvedValue(validOrder());
    dbMock.saleReturn.findFirst.mockResolvedValue(null);
    dbMock.saleReturn.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(authorizedReturn, data);
      return authorizedReturn;
    });
    dbMock.saleReturn.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(authorizedReturn, data);
      return authorizedReturn;
    });
    dbMock.saleReturn.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(authorizedReturn, data);
      return { count: 1 };
    });
    dbMock.saleReturn.findUnique.mockImplementation(async () => authorizedReturn);
    dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
    dbMock.$queryRaw.mockResolvedValue([{ id: "order-1" }]);
    dbMock.saleReturnItem.createMany.mockResolvedValue({ count: 1 });
    dbMock.product.update.mockResolvedValue({});
    dbMock.stockMovement.createMany.mockResolvedValue({ count: 1 });
    dbMock.cashBox.update.mockResolvedValue({});
    dbMock.cashMovement.create.mockResolvedValue({});
    preflightMock.mockImplementation(async ({ businessId, tipoFactura }: { businessId: string; tipoFactura: number }) =>
      businessId === "business-1" && tipoFactura === 8
        ? { success: true, emissionPointOfSale: 9 }
        : { success: false, error: "Configuración fiscal no disponible" });
    prepareMock.mockResolvedValue({ success: true, prepared: { opaque: true } });
    issueMock.mockResolvedValue({ success: true, data: { cae: "79999999999999", nroComprobante: 88, ptoVenta: 9 } });
  });

  it("rejects unauthenticated calls without reading or writing the database", async () => {
    authMock.mockResolvedValue(null);
    const { createCreditNoteAction } = await loadAction();

    const result = await createCreditNoteAction(validInput);

    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/autoriz|sesión/i) });
    expect(dbMock.order.findFirst).not.toHaveBeenCalled();
    expect(prepareMock).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("rejects malformed or unconfirmed input before AFIP", async () => {
    const { createCreditNoteAction } = await loadAction();

    for (const input of [
      { orderId: "order-1", idempotencyKey: "retry-1", confirmed: false },
      { orderId: "order-1", idempotencyKey: "retry-1", confirmed: true, total: 999 },
      { orderId: "order-1", idempotencyKey: "", confirmed: true },
    ]) {
      const result = await createCreditNoteAction(input);
      expect(result).toMatchObject({ success: false });
    }
    expect(prepareMock).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("rejects a cross-business or non-fiscal sale without mutations", async () => {
    dbMock.order.findFirst.mockResolvedValue(null);
    const { createCreditNoteAction } = await loadAction();

    const result = await createCreditNoteAction(validInput);

    expect(result).toMatchObject({ success: false, error: expect.any(String) });
    expect(dbMock.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: "business-1" }) }));
    expect(preflightMock).not.toHaveBeenCalled();
    expect(prepareMock).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
  });

  it("uses persisted sale data, creates one pending snapshot, and finalizes a full cash refund", async () => {
    const { createCreditNoteAction } = await loadAction();

    const result = await createCreditNoteAction(validInput);

    expect(result).toMatchObject({ success: true, data: expect.objectContaining({ creditNoteCAE: "79999999999999" }) });
    expect(preflightMock).toHaveBeenCalledWith({ businessId: "business-1", tipoFactura: 8 });
    expect(prepareMock).toHaveBeenCalledTimes(1);
    expect(issueMock).toHaveBeenCalledTimes(1);
    expect(dbMock.saleReturn.create).toHaveBeenCalledTimes(1);
    expect(dbMock.saleReturn.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ total: 120, refundMethod: "Efectivo", originalCAE: "ORIGINAL-CAE", creditNoteAfipType: 8 }),
    }));
    expect(prepareMock).toHaveBeenCalledWith(expect.objectContaining({ nroAsociado: 1234, ptoVenta: 9 }), expect.objectContaining({
      id: "user-1", businessId: "business-1",
    }));
    expect(dbMock.cashboxSession.findFirst).toHaveBeenCalled();
    expect(dbMock.cashMovement.create).toHaveBeenCalledTimes(1);
    expect(dbMock.cashMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ total: -120, paidMethod: "Efectivo", businessId: "business-1" }),
    }));
    expect(dbMock.saleReturnItem.createMany).toHaveBeenCalledTimes(1);
    expect(dbMock.product.update).toHaveBeenCalledTimes(1);
    expect(dbMock.stockMovement.createMany).toHaveBeenCalledTimes(1);
  });

  it("requires an open cashbox before preparing or reserving the credit note", async () => {
    dbMock.cashboxSession.findFirst.mockResolvedValue(null);
    const { createCreditNoteAction } = await loadAction();

    const result = await createCreditNoteAction(validInput);

    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE", error: expect.stringMatching(/caja/i) });
    expect(preflightMock).toHaveBeenCalledWith({ businessId: "business-1", tipoFactura: 8 });
    expect(prepareMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(financialEffects.every((effect) => !effect.mock.calls.length)).toBe(true);
  });

  it("leaves local financial effects untouched when AFIP rejects", async () => {
    issueMock.mockResolvedValue({
      error: { message: "AFIP rechazó el comprobante; credentials must not leak" },
      diagnostic: {
        reason: "afip-error",
        status: 400,
        authoritativeRejection: true,
        routes: ["error"],
        fields: { error: "object" },
      },
    });
    const { createCreditNoteAction } = await loadAction();

    const result = await createCreditNoteAction(validInput);

    expect(result).toMatchObject({ success: false, error: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain("credentials");
    expect(issueMock).toHaveBeenCalledTimes(1);
    expect(dbMock.saleReturn.create).toHaveBeenCalledTimes(1);
    expect(dbMock.saleReturn.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "REJECTED" }),
    }));
    expect(financialEffects.every((effect) => !effect.mock.calls.length)).toBe(true);
  });

  it("replays the existing result for the same idempotency key and rejects a second key", async () => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({ saleReturns: [{
      id: "return-1", kind: "CREDIT_NOTE", idempotencyKey: "retry-1", status: "AUTHORIZED",
      creditNoteCAE: "79999999999999", creditNoteNumber: 88, creditNotePointOfSale: 9,
    }] }));
    const { createCreditNoteAction } = await loadAction();

    await expect(createCreditNoteAction(validInput)).resolves.toMatchObject({ success: true });
    await expect(createCreditNoteAction({ ...validInput, idempotencyKey: "retry-2" })).resolves.toMatchObject({ success: false });
    expect(preflightMock).not.toHaveBeenCalled();
    expect(prepareMock).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
  });
});
