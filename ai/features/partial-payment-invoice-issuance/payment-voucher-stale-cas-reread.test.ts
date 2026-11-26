// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPaymentVoucherForSession } from "@/lib/server/payment-voucher";

const mocks = vi.hoisted(() => ({
  cashMovementFindFirst: vi.fn(),
  paymentVoucherFindFirst: vi.fn(),
  voucherUpdateMany: vi.fn(),
  attemptUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cashMovement: { findFirst: mocks.cashMovementFindFirst },
    paymentVoucher: { findFirst: mocks.paymentVoucherFindFirst },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-1" } }),
}));

const voucherRow = (status: string, updatedAt: Date) => ({
  id: "voucher-1",
  cashMovementId: "movement-1",
  businessId: "business-1",
  status,
  amount: { toString: () => "123" },
  billType: "Factura B",
  afipVoucherType: 6,
  invoiceNumber: status === "AUTHORIZED" ? 91 : null,
  invoicePointOfSale: 7,
  cae: status === "AUTHORIZED" ? "12345678901234" : null,
  caeVencimiento: null,
  qrData: null,
  issuedAt: status === "AUTHORIZED" ? new Date("2026-06-01T12:00:00.000Z") : null,
  fiscalSnapshot: null,
  currentAttempt: 1,
  updatedAt,
  attempts: [{
    billType: "Factura B",
    status: status === "AUTHORIZED" ? "AUTHORIZED" : "ISSUING",
    attemptNumber: 1,
    amount: { toString: () => "123" },
    invoicePointOfSale: 7,
    recipientSnapshot: { name: "Cliente", ivaCondition: "Consumidor Final", documentType: null, documentNumber: null },
  }],
});

describe("lectura tras perder compare-and-set de recuperación vencida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T13:00:00.000Z"));
    mocks.cashMovementFindFirst.mockResolvedValue({
      id: "movement-1",
      businessId: "business-1",
      total: 123,
      business: { name: "Local", ptoVenta: [7], condicionIva: "Responsable Inscripto" },
      order: { id: "order-1", businessId: "business-1" },
    });
    mocks.paymentVoucherFindFirst
      .mockResolvedValueOnce(voucherRow("ISSUING", new Date("2026-06-01T12:00:00.000Z")))
      .mockResolvedValueOnce(voucherRow("AUTHORIZED", new Date("2026-06-01T12:59:00.000Z")));
    mocks.voucherUpdateMany.mockResolvedValue({ count: 0 });
    mocks.attemptUpdateMany.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      paymentVoucher: { updateMany: mocks.voucherUpdateMany },
      paymentVoucherAttempt: { updateMany: mocks.attemptUpdateMany },
    }));
  });

  afterEach(() => vi.useRealTimers());

  it("vuelve a leer y devuelve el estado durable actualizado si el CAS vencido afectó cero filas", async () => {
    const status = await getPaymentVoucherForSession({ cashMovementId: "movement-1" });

    expect(mocks.voucherUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.voucherUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "voucher-1", status: { in: ["ISSUING", "PENDING"] } }),
    }));
    expect(mocks.paymentVoucherFindFirst).toHaveBeenCalledTimes(2);
    expect(mocks.attemptUpdateMany).not.toHaveBeenCalled();
    expect(status).toMatchObject({ status: "AUTHORIZED" });
    expect(status).not.toMatchObject({ status: "UNKNOWN" });
  });
});
