import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, prepareMock, issueMock, billingPreflightMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prepareMock: vi.fn(), issueMock: vi.fn(), billingPreflightMock: vi.fn(),
  dbMock: {
  order: { findFirst: vi.fn() },
  saleReturn: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  saleReturnItem: { createMany: vi.fn() },
  stockMovement: { createMany: vi.fn() },
  cashBox: { update: vi.fn() },
  cashMovement: { create: vi.fn() },
  product: { findMany: vi.fn() },
  cashboxSession: { findFirst: vi.fn() },
  business: { findUnique: vi.fn().mockResolvedValue({ id: "business-1", cuit: "20123456789", cert: "cert", key: "key", ptoVenta: [7], planDefinition: { name: "BASIC", features: { hasAfipBilling: true }, limits: {} } }) },
  $queryRaw: vi.fn().mockResolvedValue([{ id: "order-1" }]),
  $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/server/arca-billing", () => ({ preflightCreditNoteBillingConfiguration: billingPreflightMock }));
vi.mock("@/lib/server/afip-voucher", () => ({ prepareAfipVoucherForActor: prepareMock, issuePreparedAfipVoucher: issueMock }));

import { createCreditNoteAction } from "@/actions/sales/credit-note";

const validOrder = (overrides: Record<string, unknown> = {}) => ({
  id: "order-1",
  businessId: "business-1",
  paidStatus: "pago",
  CAE: { CAE: "71234567890123" },
  billType: "Factura A",
  afipVoucherType: 1,
  invoiceNumber: 10,
  invoicePointOfSale: 3,
  total: 1000,
  clientIvaCondition: "Consumidor Final",
  clientDocumentType: "DNI",
  clientDocumentNumber: "12345678",
  items: [{ id: "item-1", productId: "product-1", code: "P1", description: "Product", price: 1000, costPrice: 500, quantity: 1, subTotal: 1000 }],
  returns: [],
  fiscalSnapshot: { source: "AUTHORIZED_VOUCHER", version: 1, billType: "Factura A", afipVoucherType: 1, issuerIvaCondition: "Responsable Inscripto", buyerIvaCondition: "Consumidor Final", currency: "ARS", total: 1000, net: 1000, vat: 0, nonTaxed: 0, exempt: 0, otherTaxes: 0, iva: [{ id: 5, base: 1000, amount: 0 }] },
  ...overrides,
});

describe("createCreditNoteAction request boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1", businessId: "business-1", role: "ADMIN", email: "user@example.test" } });
    billingPreflightMock.mockResolvedValue({ success: true, emissionPointOfSale: 3 });
    dbMock.business.findUnique.mockResolvedValue({ id: "business-1", ptoVenta: [3] });
    prepareMock.mockResolvedValue({ success: true, prepared: {} });
    issueMock.mockResolvedValue({ success: true, data: { cae: "79999999999999", nroComprobante: 20, ptoVenta: 3 } });
    dbMock.order.findFirst.mockResolvedValue(validOrder());
    dbMock.product.findMany.mockResolvedValue([{ id: "product-1" }]);
    dbMock.cashboxSession.findFirst.mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" });
    dbMock.saleReturn.findFirst.mockResolvedValue(null);
    dbMock.saleReturn.create.mockResolvedValue({ id: "return-1", status: "PENDING", idempotencyKey: "key-1" });
    dbMock.saleReturn.update.mockResolvedValue({ id: "return-1", status: "PENDING", creditNoteCAE: "79999999999999", creditNoteNumber: 20, creditNotePointOfSale: 3 });
    dbMock.saleReturn.findUnique.mockResolvedValue({ id: "return-1", status: "AUTHORIZED", creditNoteCAE: "79999999999999", creditNoteNumber: 20, creditNotePointOfSale: 3 });
    dbMock.saleReturn.updateMany.mockResolvedValue({ count: 1 });
    dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  });

  it("authenticates at invocation entry and rejects unauthenticated requests", async () => {
    authMock.mockResolvedValue(null);

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: false });
    expect(dbMock.order.findFirst).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("validates the confirmed action contract before request-bound work", async () => {
    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: false, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: false });
    expect(authMock).not.toHaveBeenCalled();
    expect(dbMock.order.findFirst).not.toHaveBeenCalled();
  });

  it("scopes the reread to the authenticated business instead of trusting browser fiscal fields", async () => {
    await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(dbMock.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-1", businessId: "business-1" },
    }));
    expect(prepareMock).toHaveBeenCalledWith(expect.objectContaining({
      nroAsociado: 10,
      ptoVentaAsociado: 3,
    }), expect.anything());
  });

  it("reconstructs historical fiscal values from persisted CAE metadata", async () => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({
      invoiceNumber: undefined,
      invoicePointOfSale: undefined,
      CAE: { CAE: "71234567890123", nroComprobante: 44, ptoVenta: 7 },
    }));

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: false, pending: true });
    expect(prepareMock).toHaveBeenCalledWith(expect.objectContaining({ nroAsociado: 44, ptoVentaAsociado: 7 }), expect.anything());
  });

  it("returns a controlled result for AFIP rejection and never leaks secret-shaped errors", async () => {
    issueMock.mockRejectedValue(new Error("private key token=do-not-leak"));

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: false });
    expect(result).not.toEqual(expect.objectContaining({ error: expect.stringMatching(/private|token/i) }));
  });

  it("returns the existing authorized result for the same idempotency key without another AFIP call", async () => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({
      returns: [{ id: "return-1", kind: "CREDIT_NOTE", status: "AUTHORIZED", idempotencyKey: "key-1", creditNoteCAE: "79999999999999", creditNoteNumber: 20, creditNotePointOfSale: 3 }],
    }));

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: true, data: { creditNoteCAE: "79999999999999" } });
    expect(issueMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
  });

  it("rejects a different idempotency key after authorization", async () => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({
      returns: [{ id: "return-1", kind: "CREDIT_NOTE", status: "AUTHORIZED", idempotencyKey: "other-key", creditNoteCAE: "79999999999999", creditNoteNumber: 20, creditNotePointOfSale: 3 }],
    }));

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: false });
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("does not start a second emission while an existing return is pending", async () => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({
      returns: [{ id: "return-1", kind: "CREDIT_NOTE", status: "PENDING", idempotencyKey: "key-1" }],
    }));

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: false, pending: true });
    expect(issueMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
  });
});
