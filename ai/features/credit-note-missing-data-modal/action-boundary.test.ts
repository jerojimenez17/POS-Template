import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, prepareMock, issueMock, billingPreflightMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(), prepareMock: vi.fn(), issueMock: vi.fn(), billingPreflightMock: vi.fn(), dbMock: {
    order: { findFirst: vi.fn() }, business: { findUnique: vi.fn() }, saleReturn: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() }, saleReturnItem: { createMany: vi.fn() }, product: { update: vi.fn() }, stockMovement: { createMany: vi.fn() }, cashboxSession: { findFirst: vi.fn() }, cashBox: { update: vi.fn() }, cashMovement: { create: vi.fn() }, $queryRaw: vi.fn().mockResolvedValue([{ id: "o-1" }]),
    $transaction: vi.fn(),
  },
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/server/arca-billing", () => ({ preflightCreditNoteBillingConfiguration: billingPreflightMock }));
vi.mock("@/lib/server/afip-voucher", () => ({ prepareAfipVoucherForActor: prepareMock, issuePreparedAfipVoucher: issueMock }));

import { createCreditNoteAction } from "@/actions/sales/credit-note";

const validOrder = (overrides: Record<string, unknown> = {}) => ({ id: "o-1", businessId: "b-1", paidStatus: "pago", CAE: { CAE: "71234567890123" }, billType: "Factura A", afipVoucherType: 1, invoiceNumber: 10, invoicePointOfSale: 3, total: 1000, fiscalSnapshot: { source: "AUTHORIZED_VOUCHER", version: 1, billType: "Factura A", afipVoucherType: 1, issuerIvaCondition: "Responsable Inscripto", buyerIvaCondition: "Consumidor Final", currency: "ARS", total: 1000, net: 1000, vat: 0, nonTaxed: 0, exempt: 0, otherTaxes: 0, iva: [{ id: 5, base: 1000, amount: 0 }] }, clientIvaCondition: "Consumidor Final", clientDocumentType: "DNI", clientDocumentNumber: "123", items: [{ id: "i-1", productId: "p-1", code: "P", description: "P", price: 1000, costPrice: 500, quantity: 1, subTotal: 1000 }], returns: [], ...overrides });

describe("credit-note recovery server boundary (RED)", () => {
  beforeEach(() => { vi.clearAllMocks(); authMock.mockResolvedValue({ user: { id: "u-1", businessId: "b-1", role: "ADMIN" } }); billingPreflightMock.mockResolvedValue({ success: true, emissionPointOfSale: 3 }); prepareMock.mockResolvedValue({ success: true, prepared: {} }); issueMock.mockResolvedValue({ success: true, data: { cae: "79999999999999", nroComprobante: 20, ptoVenta: 3 } }); dbMock.business.findUnique.mockResolvedValue({ id: "b-1", ptoVenta: [3] }); dbMock.order.findFirst.mockResolvedValue(validOrder()); dbMock.saleReturn.findFirst.mockResolvedValue(null); dbMock.saleReturn.create.mockResolvedValue({ id: "r-1", status: "PENDING", idempotencyKey: "k" }); dbMock.saleReturn.update.mockResolvedValue({ id: "r-1", status: "PENDING", creditNoteCAE: "79999999999999", creditNoteNumber: 20, creditNotePointOfSale: 3 }); dbMock.saleReturn.updateMany.mockResolvedValue({ count: 1 }); dbMock.cashboxSession.findFirst.mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }); dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) => callback(dbMock)); });

  it.each([
    { eligibleForFullCreditNote: true }, { cae: "79999999999999" }, { total: 1 }, { items: [] }, { clientId: "attacker" }, { businessId: "other" },
  ])("rejects client-authoritative manipulated field %s before DB/AFIP", async (field) => {
    const result = await createCreditNoteAction({ orderId: "o-1", confirmed: true, idempotencyKey: "k", ...field });
    expect(result.success).toBe(false);
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("accepts only strict missingFiscalData and rejects unknown nested keys before auth", async () => {
    const result = await createCreditNoteAction({ orderId: "o-1", confirmed: true, idempotencyKey: "k", missingFiscalData: { billType: "Factura A", cae: "invented" } });
    expect(result.success).toBe(false);
    expect(authMock).not.toHaveBeenCalled();
    expect(dbMock.order.findFirst).not.toHaveBeenCalled();
  });

  it("merges only the missing billType for historical CAE data", async () => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({ billType: undefined, afipVoucherType: undefined }));
    const result = await createCreditNoteAction({ orderId: "o-1", confirmed: true, idempotencyKey: "k", missingFiscalData: { billType: "Factura A" } });
    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("does not overwrite a persisted type with a different proposal", async () => {
    const result = await createCreditNoteAction({ orderId: "o-1", confirmed: true, idempotencyKey: "k", missingFiscalData: { billType: "Factura B" } });
    expect(result).toMatchObject({ success: false, code: "CONFLICT" });
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("reads by order id and authenticated business scope", async () => {
    await createCreditNoteAction({ orderId: "o-1", confirmed: true, idempotencyKey: "k" });
    expect(dbMock.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "o-1", businessId: "b-1" } }));
  });

  it.each(["PENDING", "AUTHORIZED"] as const)("does not call AFIP twice for %s return", async (status) => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({ returns: [{ kind: "CREDIT_NOTE", status, idempotencyKey: "k", creditNoteCAE: status === "AUTHORIZED" ? "79999999999999" : null }] }));
    await createCreditNoteAction({ orderId: "o-1", confirmed: true, idempotencyKey: "k" });
    expect(issueMock).not.toHaveBeenCalled();
  });
});
