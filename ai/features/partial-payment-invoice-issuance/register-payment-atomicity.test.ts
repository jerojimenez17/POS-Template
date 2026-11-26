// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { registerPayment } from "@/actions/unpaid-orders";
import { issuePaymentVoucherForSession } from "@/lib/server/payment-voucher";

const { businessId, pointOfSale } = vi.hoisted(() => ({
  businessId: "business-partial-payment",
  pointOfSale: 7,
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    business: { findUnique: vi.fn().mockResolvedValue({ ptoVenta: [7] }) },
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId } }),
}));

vi.mock("@/lib/server/payment-voucher", () => ({
  issuePaymentVoucherForSession: vi.fn().mockResolvedValue({
    paymentRecorded: true,
    voucherStatus: "PENDING",
  }),
}));

vi.mock("@/lib/pusher-server", () => ({
  pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

interface RegistrationHarness {
  transactionTrace: string[];
  committed: boolean;
  movementCreate: ReturnType<typeof vi.fn>;
  voucherCreate: ReturnType<typeof vi.fn>;
  attemptCreate: ReturnType<typeof vi.fn>;
  orderUpdate: ReturnType<typeof vi.fn>;
  clientUpdate: ReturnType<typeof vi.fn>;
}

const createHarness = async (options?: { failVoucherReservation?: boolean }): Promise<RegistrationHarness> => {
  const { db } = await import("@/lib/db");
  const transactionTrace: string[] = [];
  const stagedWrites: string[] = [];
  let nextMovementNumber = 0;
  let activeMovementId = "movement-1";
  const harness: RegistrationHarness = {
    transactionTrace,
    committed: false,
    movementCreate: vi.fn(async () => {
      nextMovementNumber += 1;
      activeMovementId = `movement-${nextMovementNumber}`;
      transactionTrace.push("movement");
      stagedWrites.push("movement");
      return { id: activeMovementId, total: 123, orderId: "order-1" };
    }),
    voucherCreate: vi.fn(async () => {
      transactionTrace.push("voucher");
      if (options?.failVoucherReservation) throw new Error("reservation persistence failed");
      stagedWrites.push("voucher");
      return { id: `voucher-${nextMovementNumber}`, cashMovementId: activeMovementId, status: "PENDING" };
    }),
    attemptCreate: vi.fn(async () => {
      transactionTrace.push("attempt");
      stagedWrites.push("attempt");
      return { id: "attempt-1", attemptNumber: 1, status: "PREPARING" };
    }),
    orderUpdate: vi.fn().mockResolvedValue({ id: "order-1" }),
    clientUpdate: vi.fn().mockResolvedValue({ id: "client-1" }),
  };

  vi.mocked(db.$transaction).mockImplementation(async (callback) => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: "order-1",
          businessId,
          total: 500,
          paidStatus: "inpago",
          clientId: "client-1",
          client: {
            id: "client-1",
            name: "Destinatario reservado",
            ivaCondition: "Responsable Inscripto",
            fiscalDocumentType: "CUIT",
            fiscalDocumentNumber: "20123456789",
          },
          cashMovements: [],
          // Payment invoices must never replace the original order invoice.
          CAE: "ORDER-CAE-UNCHANGED",
          billType: "Factura C",
          invoiceNumber: 42,
          invoicePointOfSale: 2,
          invoiceIssuedAt: new Date("2024-01-01T00:00:00Z"),
          fiscalSnapshot: { origin: "original-order" },
        }),
        update: harness.orderUpdate,
      },
      cashMovement: { create: harness.movementCreate },
      paymentVoucher: { create: harness.voucherCreate },
      paymentVoucherAttempt: { create: harness.attemptCreate },
      client: { update: harness.clientUpdate },
    };

    try {
      const result = await callback(tx as never);
      harness.committed = true;
      // The mock transaction's durable view changes only after callback success.
      expect(stagedWrites).toContain("movement");
      return result;
    } catch (error) {
      stagedWrites.length = 0;
      throw error;
    }
  });
  return harness;
};

const paymentInput = (billType: "Factura A" | "Factura B" | "Factura C", idempotencyKey: string) => ({
  orderId: "order-1",
  idempotencyKey,
  amount: 123,
  paymentMethod: "efectivo",
  businessId,
  billType,
  ptoVenta: pointOfSale,
});

describe("registro durable del pago parcial y su intención fiscal", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@/lib/db");
    vi.mocked(db.business.findUnique).mockResolvedValue({ ptoVenta: [pointOfSale] } as never);
    vi.mocked(issuePaymentVoucherForSession).mockResolvedValue({
      paymentRecorded: true,
      voucherStatus: "PENDING",
    });
  });

  it.each(["Factura A", "Factura B", "Factura C"] as const)(
    "%s confirma movimiento, voucher e intento PREPARING en una sola transacción antes de cualquier emisión",
    async (billType) => {
      const harness = await createHarness();
      vi.mocked(issuePaymentVoucherForSession).mockImplementationOnce(async () => {
        expect(harness.committed).toBe(true);
        return { paymentRecorded: true, voucherStatus: "PENDING" };
      });

      const result = await registerPayment(paymentInput(billType, "c91d6534-c340-4abe-b340-e875c4ef0001"));

      expect(result).toMatchObject({ success: true, data: { paymentRecorded: true } });
      expect(harness.movementCreate).toHaveBeenCalledTimes(1);
      expect(harness.voucherCreate).toHaveBeenCalledTimes(1);
      const voucherWrite = harness.voucherCreate.mock.calls[0]?.[0] as
        | { data?: Record<string, unknown> }
        | undefined;
      const voucherData = voucherWrite?.data;
      expect(voucherData).toEqual(expect.objectContaining({
        cashMovementId: "movement-1",
        businessId,
        status: "PENDING",
        amount: 123,
        billType,
        invoicePointOfSale: pointOfSale,
      }));

      const nestedAttempts = voucherData?.attempts as
        | { create?: Record<string, unknown> }
        | undefined;
      const nestedAttempt = nestedAttempts?.create;
      const directAttemptWrite = harness.attemptCreate.mock.calls[0]?.[0] as
        | { data?: Record<string, unknown> }
        | undefined;
      expect(Boolean(nestedAttempt) || Boolean(directAttemptWrite?.data)).toBe(true);
       expect(nestedAttempt ?? directAttemptWrite?.data).toEqual(expect.objectContaining({
         attemptNumber: 1,
         status: "PREPARING",
         billType,
         amount: 123,
         invoicePointOfSale: pointOfSale,
         recipientSnapshot: {
           name: "Destinatario reservado",
           ivaCondition: billType === "Factura B" ? "Consumidor Final" : "Responsable Inscripto",
           documentType: "CUIT",
           documentNumber: "20123456789",
         },
       }));
      expect(harness.transactionTrace[0]).toBe("movement");
      expect(harness.transactionTrace).toContain("voucher");
      if (directAttemptWrite?.data) {
        expect(harness.transactionTrace.indexOf("attempt")).toBeGreaterThan(harness.transactionTrace.indexOf("voucher"));
      }
      expect(issuePaymentVoucherForSession).toHaveBeenCalledWith({
        cashMovementId: "movement-1",
        billType,
        ptoVenta: pointOfSale,
      });
    },
  );

  it("revierte el movimiento y la contabilidad si no se puede guardar la reserva fiscal", async () => {
    const harness = await createHarness({ failVoucherReservation: true });

    const result = await registerPayment(paymentInput("Factura B", "c91d6534-c340-4abe-b340-e875c4ef0002"));

    expect(result).toMatchObject({ success: false });
    expect(harness.movementCreate).toHaveBeenCalledTimes(1);
    expect(harness.voucherCreate).toHaveBeenCalledTimes(1);
    expect(harness.committed).toBe(false);
    expect(harness.clientUpdate).not.toHaveBeenCalled();
    expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
  });

  it("repite una confirmación con la misma clave sin duplicar movimiento, voucher, intento ni contabilidad", async () => {
    const harness = await createHarness();
    const input = paymentInput("Factura C", "c91d6534-c340-4abe-b340-e875c4ef0003");

    const first = await registerPayment(input);
    const second = await registerPayment(input);

    expect(first).toMatchObject({ success: true, data: { paymentRecorded: true } });
    expect(second).toMatchObject({ success: true, data: { paymentRecorded: true } });
    expect(harness.movementCreate).toHaveBeenCalledTimes(1);
    expect(harness.voucherCreate).toHaveBeenCalledTimes(1);
    expect(harness.attemptCreate.mock.calls.length + Number(
      Boolean((harness.voucherCreate.mock.calls[0]?.[0] as { data?: { attempts?: unknown } } | undefined)?.data?.attempts),
    )).toBe(1);
    expect(harness.clientUpdate).toHaveBeenCalledTimes(1);
    expect(issuePaymentVoucherForSession).toHaveBeenCalledTimes(1);
  });

  it("permite dos confirmaciones intencionales con claves distintas aunque orden, importe y método coincidan", async () => {
    const harness = await createHarness();

    const first = await registerPayment(paymentInput("Factura B", "c91d6534-c340-4abe-b340-e875c4ef0005"));
    const second = await registerPayment(paymentInput("Factura B", "c91d6534-c340-4abe-b340-e875c4ef0006"));

    expect(first).toMatchObject({ success: true });
    expect(second).toMatchObject({ success: true });
    expect(harness.movementCreate).toHaveBeenCalledTimes(2);
    expect(harness.voucherCreate).toHaveBeenCalledTimes(2);
    expect(harness.clientUpdate).toHaveBeenCalledTimes(2);
    expect(issuePaymentVoucherForSession).toHaveBeenCalledTimes(2);
    expect(vi.mocked(issuePaymentVoucherForSession).mock.calls.map(([input]) => input.cashMovementId))
      .toEqual(["movement-1", "movement-2"]);
  });

  it("requiere clave idempotente válida y no escribe ante una clave ausente", async () => {
    const harness = await createHarness();
    const withoutKey = {
      orderId: "order-1",
      amount: 123,
      paymentMethod: "efectivo",
      businessId,
      billType: "Factura A",
      ptoVenta: pointOfSale,
    };

    const result = await registerPayment(withoutKey);

    expect(result).toMatchObject({ success: false });
    expect(harness.movementCreate).not.toHaveBeenCalled();
    expect(harness.voucherCreate).not.toHaveBeenCalled();
    expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
  });

  it("solo actualiza el estado contable de la orden y no sustituye sus datos fiscales", async () => {
    const harness = await createHarness();

    await registerPayment(paymentInput("Factura A", "c91d6534-c340-4abe-b340-e875c4ef0004"));

    expect(harness.orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-1" },
      data: { paidStatus: "inpago" },
    }));
    const updateInput = harness.orderUpdate.mock.calls[0]?.[0] as
      | { data?: Record<string, unknown> }
      | undefined;
    expect(Object.keys(updateInput?.data ?? {}).filter((key) =>
      ["CAE", "billType", "invoiceNumber", "invoicePointOfSale", "invoiceIssuedAt", "fiscalSnapshot"].includes(key),
    )).toEqual([]);
    expect(Prisma.DbNull).toBeDefined();
  });
});
