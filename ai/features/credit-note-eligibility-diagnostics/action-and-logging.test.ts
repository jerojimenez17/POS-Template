import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, afipMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  afipMock: vi.fn(),
  dbMock: { order: { findFirst: vi.fn() }, saleReturn: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() }, product: { findMany: vi.fn() }, cashboxSession: { findFirst: vi.fn() }, $transaction: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/actions/afip", () => ({ createAfipVoucherAction: afipMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { createCreditNoteAction } from "@/actions/sales/credit-note";

const invalidOrder = {
  id: "order-sensitive",
  businessId: "business-1",
  CAE: { CAE: "https://qr.test/secret", qrData: "https://qr.test/secret", token: "token-secret", privateKey: "private-key" },
  billType: "Factura A",
  afipVoucherType: 1,
  invoiceNumber: 10,
  invoicePointOfSale: 3,
  total: 1000,
  items: [{ id: "item-1", productId: "product-1", code: "P1", description: "Product", price: 1000, costPrice: 500, quantity: 1 }],
  returns: [],
};

describe("credit-note action revalidation and safe diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1", businessId: "business-1" } });
    dbMock.order.findFirst.mockResolvedValue(invalidOrder);
  });

  it("revalidates invalid fiscal data from Prisma and rejects before any AFIP call", async () => {
    const result = await createCreditNoteAction({ orderId: "order-sensitive", confirmed: true, idempotencyKey: "key-1" });
    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
    expect(result).not.toHaveProperty("error", expect.stringMatching(/7123456789012x|qr|secret|token|private/i));
    expect(afipMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
  });

  it("allows only the logging allowlist and never logs sensitive fiscal payloads", async () => {
    const spies = ["log", "info", "warn", "error"].map((method) => vi.spyOn(console, method as "log").mockImplementation(() => undefined));
    await createCreditNoteAction({ orderId: "order-sensitive", confirmed: true, idempotencyKey: "key-1" });
    const output = spies.flatMap((spy) => spy.mock.calls.flat()).map((value) => JSON.stringify(value)).join(" ");
    expect(output).not.toMatch(/qr\.test|secret|token-secret|private-key|qrData/i);
    spies.forEach((spy) => spy.mockRestore());
  });
});
