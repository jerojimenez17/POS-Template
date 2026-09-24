import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, afipMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(), afipMock: vi.fn(), dbMock: {
    order: { findFirst: vi.fn() }, saleReturn: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/actions/afip", () => ({ createAfipVoucherAction: afipMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { createCreditNoteAction } from "@/actions/sales/credit-note";

const validOrder = (overrides: Record<string, unknown> = {}) => ({ id: "o-1", businessId: "b-1", CAE: { CAE: "71234567890123" }, billType: "Factura A", afipVoucherType: 1, invoiceNumber: 10, invoicePointOfSale: 3, total: 1000, clientIvaCondition: "Consumidor Final", clientDocumentType: "DNI", clientDocumentNumber: "123", items: [{ id: "i-1", productId: "p-1", code: "P", description: "P", price: 1000, costPrice: 500, quantity: 1 }], returns: [], ...overrides });

describe("credit-note recovery server boundary (RED)", () => {
  beforeEach(() => { vi.clearAllMocks(); authMock.mockResolvedValue({ user: { id: "u-1", businessId: "b-1", role: "USER" } }); dbMock.order.findFirst.mockResolvedValue(validOrder()); dbMock.saleReturn.findFirst.mockResolvedValue(null); dbMock.saleReturn.create.mockResolvedValue({ id: "r-1", status: "PENDING", idempotencyKey: "k" }); dbMock.saleReturn.updateMany.mockResolvedValue({ count: 1 }); dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) => callback(dbMock)); afipMock.mockResolvedValue({ success: true, data: { cae: "79999999999999", nroComprobante: 20, ptoVenta: 3 } }); });

  it.each([
    { eligibleForFullCreditNote: true }, { cae: "79999999999999" }, { total: 1 }, { items: [] }, { clientId: "attacker" }, { businessId: "other" },
  ])("rejects client-authoritative manipulated field %s before DB/AFIP", async (field) => {
    const result = await createCreditNoteAction({ orderId: "o-1", confirmed: true, idempotencyKey: "k", ...field });
    expect(result.success).toBe(false);
    expect(afipMock).not.toHaveBeenCalled();
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
    expect(result.success).toBe(true);
    expect(dbMock.saleReturn.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ originalCAE: "71234567890123", originalVoucherType: 1, originalNumber: 10, originalPointOfSale: 3 }) }));
    expect(afipMock).toHaveBeenCalledWith(expect.objectContaining({ nroAsociado: 10, ptoVenta: 3 }));
  });

  it("does not overwrite a persisted type with a different proposal", async () => {
    const result = await createCreditNoteAction({ orderId: "o-1", confirmed: true, idempotencyKey: "k", missingFiscalData: { billType: "Factura B" } });
    expect(result).toMatchObject({ success: false, code: "CONFLICT" });
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(afipMock).not.toHaveBeenCalled();
  });

  it("reads by order id and authenticated business scope", async () => {
    await createCreditNoteAction({ orderId: "o-1", confirmed: true, idempotencyKey: "k" });
    expect(dbMock.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "o-1", businessId: "b-1" } }));
  });

  it.each(["PENDING", "AUTHORIZED"] as const)("does not call AFIP twice for %s return", async (status) => {
    dbMock.order.findFirst.mockResolvedValue(validOrder({ returns: [{ kind: "CREDIT_NOTE", status, idempotencyKey: "k", creditNoteCAE: status === "AUTHORIZED" ? "79999999999999" : null }] }));
    await createCreditNoteAction({ orderId: "o-1", confirmed: true, idempotencyKey: "k" });
    expect(afipMock).not.toHaveBeenCalled();
  });
});
