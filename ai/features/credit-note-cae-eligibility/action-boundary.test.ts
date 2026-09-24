import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, afipMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(), afipMock: vi.fn(), dbMock: {
    order: { findFirst: vi.fn() }, saleReturn: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn(),
  },
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/actions/afip", () => ({ createAfipVoucherAction: afipMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { createCreditNoteAction } from "@/actions/sales/credit-note";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "order-1", businessId: "business-1", CAE: JSON.stringify({ CAE: "71234567890123", qrData: "qr", invoiceNumber: 42, invoicePointOfSale: 7 }),
  billType: undefined, afipVoucherType: undefined, invoiceNumber: 42, invoicePointOfSale: 7, total: 100, items: [{ id: "i1", productId: "p1", price: 100, quantity: 1 }], returns: [], ...overrides,
});

describe("createCreditNoteAction server-side eligibility boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "u1", businessId: "business-1" } });
    dbMock.order.findFirst.mockResolvedValue(order());
  });

  it("rejects a missing-type historical sale as NOT_ELIGIBLE before reserving or calling AFIP", async () => {
    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1", eligibleForFullCreditNote: true });
    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(afipMock).not.toHaveBeenCalled();
  });

  it("re-reads fiscal data from the server instead of trusting a manipulated client eligibility flag", async () => {
    dbMock.order.findFirst.mockResolvedValue(order({ billType: "Factura B", afipVoucherType: 6 }));
    dbMock.saleReturn.findFirst.mockResolvedValue(null);
    dbMock.saleReturn.create.mockResolvedValue({ id: "return-1", status: "PENDING", idempotencyKey: "key-1" });
    dbMock.saleReturn.updateMany.mockResolvedValue({ count: 1 });
    dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
    afipMock.mockResolvedValue({ success: true, data: { cae: "79999999999999", nroComprobante: 20, ptoVenta: 7 } });
    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });
    expect(result).not.toMatchObject({ code: "NOT_ELIGIBLE" });
    expect(dbMock.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1", businessId: "business-1" } }));
    expect(afipMock).toHaveBeenCalled();
  });
});
