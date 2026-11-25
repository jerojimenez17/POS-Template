import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, prepareMock, issueMock, billingPreflightMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(), prepareMock: vi.fn(), issueMock: vi.fn(), billingPreflightMock: vi.fn(), dbMock: {
    order: { findFirst: vi.fn() }, business: { findUnique: vi.fn() }, saleReturn: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() }, saleReturnItem: { createMany: vi.fn() }, product: { update: vi.fn() }, stockMovement: { createMany: vi.fn() }, cashboxSession: { findFirst: vi.fn() }, cashBox: { update: vi.fn() }, cashMovement: { create: vi.fn() }, $queryRaw: vi.fn().mockResolvedValue([{ id: "order-1" }]), $transaction: vi.fn(),
  },
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/server/arca-billing", () => ({ preflightCreditNoteBillingConfiguration: billingPreflightMock }));
vi.mock("@/lib/server/afip-voucher", () => ({ prepareAfipVoucherForActor: prepareMock, issuePreparedAfipVoucher: issueMock }));

import { createCreditNoteAction } from "@/actions/sales/credit-note";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "order-1", businessId: "business-1", paidStatus: "pago", CAE: JSON.stringify({ CAE: "71234567890123", qrData: "qr", invoiceNumber: 42, invoicePointOfSale: 7 }),
  billType: undefined, afipVoucherType: undefined, invoiceNumber: 42, invoicePointOfSale: 7, total: 100, fiscalSnapshot: { source: "AUTHORIZED_VOUCHER", version: 1, billType: "Factura B", afipVoucherType: 6, issuerIvaCondition: "Responsable Inscripto", buyerIvaCondition: "Consumidor Final", currency: "ARS", total: 100, net: 100, vat: 0, nonTaxed: 0, exempt: 0, otherTaxes: 0, iva: [{ id: 5, base: 100, amount: 0 }] }, items: [{ id: "i1", productId: "p1", price: 100, quantity: 1, subTotal: 100 }], returns: [], ...overrides,
});

describe("createCreditNoteAction server-side eligibility boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "u1", businessId: "business-1", role: "ADMIN" } });
    billingPreflightMock.mockResolvedValue({ success: true, emissionPointOfSale: 7 });
    prepareMock.mockResolvedValue({ success: true, prepared: {} });
    issueMock.mockResolvedValue({ success: true, data: { cae: "79999999999999", nroComprobante: 20, ptoVenta: 7 } });
    dbMock.business.findUnique.mockResolvedValue({ id: "business-1", ptoVenta: [7] });
    dbMock.order.findFirst.mockResolvedValue(order());
    dbMock.cashboxSession.findFirst.mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" });
  });

  it("rejects a missing-type historical sale as NOT_ELIGIBLE before reserving or calling AFIP", async () => {
    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1", eligibleForFullCreditNote: true });
    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("re-reads fiscal data from the server instead of trusting a manipulated client eligibility flag", async () => {
    dbMock.order.findFirst.mockResolvedValue(order({ billType: "Factura B", afipVoucherType: 6 }));
    dbMock.saleReturn.findFirst.mockResolvedValue(null);
    dbMock.saleReturn.create.mockResolvedValue({ id: "return-1", status: "PENDING", idempotencyKey: "key-1" });
    dbMock.saleReturn.updateMany.mockResolvedValue({ count: 1 });
    dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });
    expect(result).not.toMatchObject({ code: "NOT_ELIGIBLE" });
    expect(dbMock.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1", businessId: "business-1" } }));
    expect(issueMock).toHaveBeenCalled();
  });
});
