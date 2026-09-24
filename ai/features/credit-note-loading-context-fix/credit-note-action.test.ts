import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, afipMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  afipMock: vi.fn(),
  dbMock: {
  order: { findFirst: vi.fn() },
  saleReturn: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  product: { findMany: vi.fn() },
  cashboxSession: { findFirst: vi.fn() },
  $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/actions/afip", () => ({ createAfipVoucherAction: afipMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { createCreditNoteAction } from "@/actions/sales/credit-note";

const validOrder = (overrides: Record<string, unknown> = {}) => ({
  id: "order-1",
  businessId: "business-1",
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
  ...overrides,
});

describe("createCreditNoteAction request boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1", businessId: "business-1", email: "user@example.test" } });
    dbMock.order.findFirst.mockResolvedValue(validOrder());
    dbMock.product.findMany.mockResolvedValue([{ id: "product-1" }]);
    dbMock.cashboxSession.findFirst.mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" });
    dbMock.saleReturn.findFirst.mockResolvedValue(null);
    dbMock.saleReturn.create.mockResolvedValue({ id: "return-1", status: "PENDING", idempotencyKey: "key-1" });
    dbMock.saleReturn.update.mockResolvedValue({ id: "return-1", status: "AUTHORIZED" });
    dbMock.saleReturn.updateMany.mockResolvedValue({ count: 1 });
    dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
    afipMock.mockResolvedValue({ success: true, data: { cae: "79999999999999", nroComprobante: 20, ptoVenta: 3 } });
  });

  it("authenticates at invocation entry and rejects unauthenticated requests", async () => {
    authMock.mockResolvedValue(null);

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: false });
    expect(dbMock.order.findFirst).not.toHaveBeenCalled();
    expect(afipMock).not.toHaveBeenCalled();
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
    expect(afipMock).toHaveBeenCalledWith(expect.objectContaining({
      nroAsociado: 10,
      ptoVenta: 3,
    }));
  });

  it("reconstructs historical fiscal values from persisted CAE metadata", async () => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({
      invoiceNumber: undefined,
      invoicePointOfSale: undefined,
      CAE: { CAE: "71234567890123", nroComprobante: 44, ptoVenta: 7 },
    }));

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: true });
    expect(afipMock).toHaveBeenCalledWith(expect.objectContaining({ nroAsociado: 44, ptoVenta: 7 }));
  });

  it("returns a controlled result for AFIP rejection and never leaks secret-shaped errors", async () => {
    afipMock.mockRejectedValue(new Error("private key token=do-not-leak"));

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: false });
    expect(result).not.toEqual(expect.objectContaining({ error: expect.stringMatching(/private|token/i) }));
  });

  it("returns the existing authorized result for the same idempotency key without another AFIP call", async () => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({
      returns: [{ id: "return-1", status: "AUTHORIZED", idempotencyKey: "key-1", creditNoteCAE: "79999999999999", creditNoteNumber: 20, creditNotePointOfSale: 3 }],
    }));

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: true, data: { creditNoteCAE: "79999999999999" } });
    expect(afipMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
  });

  it("rejects a different idempotency key after authorization", async () => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({
      returns: [{ id: "return-1", status: "AUTHORIZED", idempotencyKey: "other-key", creditNoteCAE: "79999999999999", creditNoteNumber: 20, creditNotePointOfSale: 3 }],
    }));

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: false });
    expect(afipMock).not.toHaveBeenCalled();
  });

  it("does not start a second emission while an existing return is pending", async () => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({
      returns: [{ id: "return-1", status: "PENDING", idempotencyKey: "key-1" }],
    }));

    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });

    expect(result).toMatchObject({ success: false, pending: true });
    expect(afipMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
  });
});
