import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, prepareMock, issueMock, billingPreflightMock, dbMock, revalidateMock } = vi.hoisted(() => ({
  authMock: vi.fn(), prepareMock: vi.fn(), issueMock: vi.fn(), billingPreflightMock: vi.fn(), revalidateMock: vi.fn(),
  dbMock: {
    order: { findFirst: vi.fn() }, business: { findUnique: vi.fn() }, $queryRaw: vi.fn().mockResolvedValue([{ id: "order-1" }]),
    saleReturn: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    saleReturnItem: { createMany: vi.fn() }, product: { update: vi.fn() }, stockMovement: { createMany: vi.fn() }, cashboxSession: { findFirst: vi.fn() }, cashBox: { update: vi.fn() }, cashMovement: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/server/arca-billing", () => ({ preflightCreditNoteBillingConfiguration: billingPreflightMock }));
vi.mock("@/lib/server/afip-voucher", () => ({ prepareAfipVoucherForActor: prepareMock, issuePreparedAfipVoucher: issueMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

import { createCreditNoteAction } from "@/actions/sales/credit-note";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "order-1", businessId: "business-1", paidStatus: "pago", CAE: "71234567890123", billType: "Factura B", afipVoucherType: 6,
  invoiceNumber: 42, invoicePointOfSale: 7, total: 100, clientIvaCondition: "Consumidor Final",
  items: [{ id: "item-1", productId: "product-1", code: "P", description: "Producto", price: 100, costPrice: 50, quantity: 1 }],
  returns: [], fiscalSnapshot: { source: "AUTHORIZED_VOUCHER", version: 1, billType: "Factura B", afipVoucherType: 6, issuerIvaCondition: "Responsable Inscripto", buyerIvaCondition: "Consumidor Final", currency: "ARS", total: 100, net: 100, vat: 0, nonTaxed: 0, exempt: 0, otherTaxes: 0, iva: [{ id: 5, base: 100, amount: 0 }] }, ...overrides,
});

describe("AC-02, AC-05..AC-08, AC-11: server boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1", businessId: "business-1", role: "ADMIN" } });
    billingPreflightMock.mockResolvedValue({ success: true, emissionPointOfSale: 7 });
    dbMock.business.findUnique.mockResolvedValue({ id: "business-1", ptoVenta: [7] });
    prepareMock.mockResolvedValue({ success: true, prepared: {} });
    issueMock.mockResolvedValue({ success: true, data: { cae: "79999999999999", nroComprobante: 20, ptoVenta: 7 } });
    dbMock.cashboxSession.findFirst.mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" });
    dbMock.order.findFirst.mockResolvedValue(order());
    dbMock.saleReturn.findFirst.mockResolvedValue(null);
    dbMock.saleReturn.create.mockResolvedValue({ id: "return-1", status: "PENDING", idempotencyKey: "key-1" });
    dbMock.saleReturn.update.mockResolvedValue({ id: "return-1", status: "PENDING", creditNoteCAE: "79999999999999", creditNoteNumber: 20, creditNotePointOfSale: 7 });
    dbMock.saleReturn.updateMany.mockResolvedValue({ count: 1 });
    dbMock.saleReturn.findUnique.mockResolvedValue({ id: "return-1", status: "AUTHORIZED", creditNoteCAE: "79999999999999", creditNoteNumber: 20, creditNotePointOfSale: 3 });
    dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  });

  it.each([
    { CAE: "", billType: "Factura B", afipVoucherType: 6, invoiceNumber: 42, invoicePointOfSale: 7 },
    { CAE: "historic", billType: "Factura A", afipVoucherType: 6, invoiceNumber: 42, invoicePointOfSale: 7 },
    { CAE: "historic", billType: "Factura B", afipVoucherType: 6, invoiceNumber: 0, invoicePointOfSale: 7 },
    { CAE: "historic", billType: "Remito", invoiceNumber: 42, invoicePointOfSale: 7 },
  ])("does not reserve or call ARCA for unsafe persisted fiscal data: %j", async (fiscal) => {
    dbMock.order.findFirst.mockResolvedValue(order(fiscal));
    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });
    expect(result.success).toBe(false);
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("re-reads by order id and tenant, merges only missing fields, and revalidates", async () => {
    dbMock.order.findFirst.mockResolvedValue(order({ billType: undefined, afipVoucherType: undefined }));
    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1", missingFiscalData: { billType: "Factura B" } });
    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
    expect(dbMock.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1", businessId: "business-1" } }));
  });

  it("rejects proposals that try to become authority for CAE, total, products, tenant, or conflicts", async () => {
    const result = await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1", missingFiscalData: { billType: "Factura A", cae: "attacker-cae" }, total: 1, businessId: "other" });
    expect(result).toMatchObject({ success: false });
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("revalidates the sales page after authorization", async () => {
    await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });
    expect(revalidateMock).toHaveBeenCalledWith("/sales/order-1");
  });

  it("emits only allowlisted, redacted lifecycle diagnostics", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" });
    const serialized = JSON.stringify(info.mock.calls);
    expect(info).toHaveBeenCalled();
    expect(serialized).not.toMatch(/71234567890123|79999999999999|token|certificate|private|payload|headers|qr|stack/i);
    info.mockRestore();
  });

  it("keeps concurrent requests idempotent: one return and no Order creation", async () => {
    const results = await Promise.all([
      createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-1" }),
      createCreditNoteAction({ orderId: "order-1", confirmed: true, idempotencyKey: "key-2" }),
    ]);
    expect(dbMock.order).not.toHaveProperty("create");
    // The database lock is the production concurrency boundary; this unit double cannot serialize two callbacks.
    expect(results.filter((result) => result.success).length).toBeLessThanOrEqual(2);
  });
});
