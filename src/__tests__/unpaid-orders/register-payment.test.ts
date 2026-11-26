// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerPayment } from "@/actions/unpaid-orders";
import { issuePaymentVoucherForSession } from "@/lib/server/payment-voucher";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { Prisma } from "@prisma/client";
import type { PaidStatus } from "@prisma/client";

const CONFIGURED_PTO_VENTA = 3;
let idempotencySequence = 1;

const nextIdempotencyKey = (): string => {
  const suffix = (idempotencySequence++).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
};

vi.mock("@/lib/db", () => {
  return {
    db: {
      $transaction: vi.fn(),
      business: {
        findUnique: vi.fn().mockResolvedValue({ ptoVenta: [3] }),
      },
    },
  };
});

vi.mock("@/lib/server/payment-voucher", () => ({
  issuePaymentVoucherForSession: vi.fn().mockResolvedValue({ voucherStatus: "ISSUED" }),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { businessId: "business-123" } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/pusher-server", () => ({
  pusherServer: {
    trigger: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("registerPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["missing", undefined],
    ["unsupported", "Presupuesto"],
  ])("rechaza un billType %s antes de persistir el pago", async (_label, billType) => {
    const { db } = await import("@/lib/db");
    const input = {
      orderId: "order-1",
      idempotencyKey: nextIdempotencyKey(),
      amount: 20,
      paymentMethod: "efectivo",
      businessId: "business-123",
      ...(billType === undefined ? {} : { billType }),
    };

    const result = await registerPayment(input);

    expect(result).toEqual({
      success: false,
      error: "Seleccione Factura A, Factura B o Factura C",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza más de 9,999,999,999 pesos antes de abrir la transacción o reservar el comprobante", async () => {
    const { db } = await import("@/lib/db");

    const result = await registerPayment({
      orderId: "order-over-voucher-decimal-limit",
      idempotencyKey: nextIdempotencyKey(),
      amount: 10_000_000_000,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(result.success).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
  });

  it.each([
    ["ausente", undefined],
    ["no configurado o desactualizado", 8],
  ])("rechaza un punto de venta %s antes de persistir o emitir el comprobante", async (_label, ptoVenta) => {
    const { db } = await import("@/lib/db");
    const input = {
      orderId: "order-1",
      idempotencyKey: nextIdempotencyKey(),
      amount: 20,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ...(ptoVenta === undefined ? {} : { ptoVenta }),
    };

    const result = await registerPayment(input);

    expect(result.success).toBe(false);
    expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("debe marcar la orden como 'pago' cuando el balance remaining es 0 después del pago (con pagos anteriores)", async () => {
    const { db } = await import("@/lib/db");

    const orderUpdateSpy = vi.fn().mockResolvedValue({ id: "order-1" });

    const existingCashMovements = [
      { id: "cash-1", total: 50, orderId: "order-1" },
      { id: "cash-2", total: 30, orderId: "order-1" },
    ];

    const orderWithPartialPayment = {
      id: "order-1",
      total: 100,
      clientId: "client-1",
      paidStatus: "inpago",
      cashMovements: existingCashMovements,
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([]),
          order: {
            findUnique: vi.fn().mockResolvedValue(orderWithPartialPayment),
            update: orderUpdateSpy,
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-3" }),
          },
          paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-3" }) },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await registerPayment({
      orderId: "order-1",
      idempotencyKey: nextIdempotencyKey(),
      amount: 20,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(result.success).toBe(true);

    expect(orderUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1" },
        data: { paidStatus: "pago" },
      })
    );
  });

  it("debe marcar la orden como 'pago' cuando el pago actual cubre el total sin pagos anteriores", async () => {
    const { db } = await import("@/lib/db");

    const orderUpdateSpy = vi.fn().mockResolvedValue({ id: "order-1" });

    const orderWithoutPreviousPayments = {
      id: "order-1",
      total: 100,
      clientId: "client-1",
      paidStatus: "inpago",
      cashMovements: [],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([]),
          order: {
            findUnique: vi.fn().mockResolvedValue(orderWithoutPreviousPayments),
            update: orderUpdateSpy,
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-1" }),
          },
          paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-1" }) },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await registerPayment({
      orderId: "order-1",
      idempotencyKey: nextIdempotencyKey(),
      amount: 100,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(result.success).toBe(true);
    expect(orderUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { paidStatus: "pago" },
      })
    );
  });

  it("debe mantener la orden como 'inpago' cuando el balance remaining es mayor a 0", async () => {
    const { db } = await import("@/lib/db");

    const orderUpdateSpy = vi.fn().mockResolvedValue({ id: "order-1" });

    const orderWithPartialPayment = {
      id: "order-1",
      total: 100,
      clientId: "client-1",
      paidStatus: "inpago",
      cashMovements: [{ id: "cash-1", total: 50, orderId: "order-1" }],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([]),
          order: {
            findUnique: vi.fn().mockResolvedValue(orderWithPartialPayment),
            update: orderUpdateSpy,
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-2" }),
          },
          paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-2" }) },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await registerPayment({
      orderId: "order-1",
      idempotencyKey: nextIdempotencyKey(),
      amount: 20,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(result.success).toBe(true);
    expect(orderUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { paidStatus: "inpago" },
      })
    );
  });

  it("debe incluir todos los cashMovements existentes en el cálculo del balance remaining", async () => {
    const { db } = await import("@/lib/db");

    const orderUpdateSpy = vi.fn().mockResolvedValue({ id: "order-1" });

    const existingPayments = [
      { id: "cash-1", total: 25, orderId: "order-1" },
      { id: "cash-2", total: 25, orderId: "order-1" },
      { id: "cash-3", total: 25, orderId: "order-1" },
    ];

    const order = {
      id: "order-1",
      total: 100,
      clientId: "client-1",
      paidStatus: "inpago",
      cashMovements: existingPayments,
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([]),
          order: {
            findUnique: vi.fn().mockResolvedValue(order),
            update: orderUpdateSpy,
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-4" }),
          },
          paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-4" }) },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await registerPayment({
      orderId: "order-1",
      idempotencyKey: nextIdempotencyKey(),
      amount: 25,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(result.success).toBe(true);
    expect(orderUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1" },
        data: { paidStatus: "pago" },
      })
    );
  });

  it.each([
    ["menor a un peso", 0.49],
    ["la suma flotante 0.1 + 0.2", 0.1 + 0.2],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rechaza un importe inválido o menor a un peso antes de cualquier efecto (%s)", async (_label, amount) => {
    const { db } = await import("@/lib/db");
    const { pusherServer } = await import("@/lib/pusher-server");
    const cashMovementCreate = vi.fn().mockResolvedValue({ id: "cash-invalid" });
    const orderUpdate = vi.fn().mockResolvedValue({ id: "order-1" });
    const clientUpdate = vi.fn().mockResolvedValue({ id: "client-1" });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => {
      return callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: "order-1",
            total: 10,
            clientId: "client-1",
            businessId: "business-123",
            paidStatus: "inpago",
            cashMovements: [],
          }),
          update: orderUpdate,
        },
        cashMovement: { create: cashMovementCreate },
        paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-invalid" }) },
        client: { update: clientUpdate },
      });
    });

    const result = await registerPayment({
      orderId: "order-1",
      idempotencyKey: nextIdempotencyKey(),
      amount,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect({
      success: result.success,
      transactionCalls: vi.mocked(db.$transaction).mock.calls.length,
      cashMovementWrites: cashMovementCreate.mock.calls.length,
      orderWrites: orderUpdate.mock.calls.length,
      clientBalanceWrites: clientUpdate.mock.calls.length,
      pusherCalls: vi.mocked(pusherServer.trigger).mock.calls.length,
      voucherCalls: vi.mocked(issuePaymentVoucherForSession).mock.calls.length,
    }).toEqual({
      success: false,
      transactionCalls: 0,
      cashMovementWrites: 0,
      orderWrites: 0,
      clientBalanceWrites: 0,
      pusherCalls: 0,
      voucherCalls: 0,
    });
  });

  it.each([
    ["10.5 se normaliza a 11", 10.5, 11, "inpago", 1],
    ["10.49 se normaliza a 10", 10.49, 10, "inpago", 1],
    ["0.5 se normaliza a 1", 0.5, 1, "inpago", 1],
  ] as const)("persiste el importe redondeado a pesos enteros: %s", async (_label, amount, expectedAmount, expectedPaidStatus, expectedMovementWrites) => {
    const { db } = await import("@/lib/db");
    const orderUpdateSpy = vi.fn().mockResolvedValue({ id: "order-1" });
    const cashMovementCreateSpy = vi.fn().mockResolvedValue({ id: "cash-new" });
    const orderWithPriorCentPayment = {
      id: "order-1",
      total: 20,
      clientId: "client-1",
      businessId: "business-123",
      paidStatus: "inpago" as PaidStatus,
      cashMovements: [],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => {
      return callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        order: {
          findUnique: vi.fn().mockResolvedValue(orderWithPriorCentPayment),
          update: orderUpdateSpy,
        },
        cashMovement: { create: cashMovementCreateSpy },
        paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-rounded" }) },
        client: { update: vi.fn().mockResolvedValue({ id: "client-1" }) },
      });
    });

    const clientUpdateSpy = vi.fn().mockResolvedValue({ id: "client-1" });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => callback({
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: {
        findUnique: vi.fn().mockResolvedValue(orderWithPriorCentPayment),
        update: orderUpdateSpy,
      },
      cashMovement: { create: cashMovementCreateSpy },
      paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-rounded" }) },
      client: { update: clientUpdateSpy },
    }));

    const result = await registerPayment({
      orderId: "order-1",
      idempotencyKey: nextIdempotencyKey(),
      amount,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(result.success).toBe(true);
    expect(cashMovementCreateSpy).toHaveBeenCalledTimes(expectedMovementWrites);
    expect(cashMovementCreateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: expectedAmount }) }));
    expect(clientUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: { balance: { decrement: expectedAmount } } }));
    expect(orderUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: { paidStatus: expectedPaidStatus } }));
  });

  it("normalizes order, prior movement and payment before remaining-balance/status decisions", async () => {
    const { db } = await import("@/lib/db");
    const orderUpdateSpy = vi.fn().mockResolvedValue({ id: "order-1" });
    const cashMovementCreateSpy = vi.fn().mockResolvedValue({ id: "cash-new" });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => callback({
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: "order-1",
          total: 10.005,
          clientId: "client-1",
          businessId: "business-123",
          paidStatus: "inpago",
          cashMovements: [{ id: "cash-prior", total: 1.5, orderId: "order-1" }],
        }),
        update: orderUpdateSpy,
      },
      cashMovement: { create: cashMovementCreateSpy },
      paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-normalized" }) },
      client: { update: vi.fn().mockResolvedValue({ id: "client-1" }) },
    }));

    const result = await registerPayment({
      orderId: "order-1",
      idempotencyKey: nextIdempotencyKey(),
      amount: 7.5,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(result.success).toBe(true);
    expect(cashMovementCreateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 8 }) }));
    expect(orderUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: { paidStatus: "pago" } }));
  });

  it("continúa con todas las revalidaciones y el intento de comprobante si Pusher falla tras confirmar el pago", async () => {
    const { db } = await import("@/lib/db");
    const { pusherServer } = await import("@/lib/pusher-server");
    const { revalidateTag } = await import("next/cache");
    let transactionCommitted = false;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => {
      const transactionResult = await callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: "order-1",
            total: 20,
            clientId: "client-1",
            businessId: "business-123",
            paidStatus: "inpago",
            cashMovements: [],
          }),
          update: vi.fn().mockResolvedValue({ id: "order-1" }),
        },
        cashMovement: { create: vi.fn().mockResolvedValue({ id: "cash-committed" }) },
        paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-committed" }) },
        client: { update: vi.fn().mockResolvedValue({ id: "client-1" }) },
      });
      transactionCommitted = true;
      return transactionResult;
    });
    vi.mocked(pusherServer.trigger).mockImplementationOnce(async () => {
      if (!transactionCommitted) throw new Error("Pusher ran before payment commit");
      throw new Error("Pusher unavailable");
    });
    vi.mocked(issuePaymentVoucherForSession).mockResolvedValueOnce({ voucherStatus: "ISSUED" });

    const result = await registerPayment({
      orderId: "order-1",
      idempotencyKey: nextIdempotencyKey(),
      amount: 20,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect({
      transactionCommitted,
      pusherCalls: vi.mocked(pusherServer.trigger).mock.calls.length,
      revalidatedTags: [...new Set(vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag))],
      voucherCalls: vi.mocked(issuePaymentVoucherForSession).mock.calls,
      result,
    }).toEqual({
      transactionCommitted: true,
      pusherCalls: 1,
      revalidatedTags: [CACHE_TAGS.ORDERS, CACHE_TAGS.CLIENTS, CACHE_TAGS.CASHBOX],
      voucherCalls: [[{
        cashMovementId: "cash-committed",
        billType: "Factura B",
        ptoVenta: CONFIGURED_PTO_VENTA,
      }]],
      result: { success: true, data: { paymentRecorded: true, voucherStatus: "ISSUED" } },
    });
  });

  it("reports a known pre-dispatch voucher failure as FAILED without misreporting the committed payment", async () => {
    const { db } = await import("@/lib/db");
    const cashMovementCreate = vi.fn().mockResolvedValue({ id: "cash-without-client" });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => callback({
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: "order-without-client",
          total: 20,
          clientId: null,
          businessId: "business-123",
          paidStatus: "inpago",
          cashMovements: [],
        }),
        update: vi.fn().mockResolvedValue({ id: "order-without-client" }),
      },
      cashMovement: { create: cashMovementCreate },
      paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-no-client" }) },
      client: { update: vi.fn() },
    }));
    vi.mocked(issuePaymentVoucherForSession).mockRejectedValueOnce(
      new Error("El pago necesita un cliente asociado antes de emitir una factura"),
    );

    const result = await registerPayment({
      orderId: "order-without-client",
      idempotencyKey: nextIdempotencyKey(),
      amount: 20,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(cashMovementCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      data: { paymentRecorded: true, voucherStatus: "FAILED" },
    });
    expect(result).not.toMatchObject({ data: { reconciliationRequired: true } });
  });

  it("keeps an automatically registered payment successful when voucher dispatch is ambiguous", async () => {
    const { db } = await import("@/lib/db");
    const cashMovementCreate = vi.fn().mockResolvedValue({ id: "cash-possibly-dispatched" });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => callback({
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: "order-ambiguous-voucher",
          total: 20,
          clientId: "client-1",
          businessId: "business-123",
          paidStatus: "inpago",
          cashMovements: [],
        }),
        update: vi.fn().mockResolvedValue({ id: "order-ambiguous-voucher" }),
      },
      cashMovement: { create: cashMovementCreate },
      paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-ambiguous" }) },
      client: { update: vi.fn().mockResolvedValue({ id: "client-1" }) },
    }));
    vi.mocked(issuePaymentVoucherForSession).mockResolvedValueOnce({
      paymentRecorded: true,
      voucherStatus: "UNKNOWN",
      reconciliationRequired: true,
    });

    const result = await registerPayment({
      orderId: "order-ambiguous-voucher",
      idempotencyKey: nextIdempotencyKey(),
      amount: 20,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(cashMovementCreate).toHaveBeenCalledTimes(1);
    expect(issuePaymentVoucherForSession).toHaveBeenCalledWith({
      cashMovementId: "cash-possibly-dispatched",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });
    expect(result).toEqual({
      success: true,
      data: { paymentRecorded: true, voucherStatus: "UNKNOWN", reconciliationRequired: true },
    });
  });

  it("acquires the same-order row lock before reading the balance", async () => {
    const { db } = await import("@/lib/db");
    const events: string[] = [];
    let capturedLockSql = "";
    let releaseLock!: () => void;
    const lockGate = new Promise<void>((resolve) => { releaseLock = resolve; });
    let signalBoundary!: () => void;
    const transactionBoundary = new Promise<void>((resolve) => { signalBoundary = resolve; });
    const orderLock = vi.fn(async (query: TemplateStringsArray) => {
      capturedLockSql = query.join("?");
      signalBoundary();
      events.push("lock-requested");
      await lockGate;
      events.push("order-lock-acquired");
      return [];
    });
    const balanceRead = vi.fn(async () => {
      signalBoundary();
      events.push("balance-read");
      return {
        id: "order-locked",
        total: 10,
        clientId: "client-1",
        businessId: "business-123",
        paidStatus: "inpago" as PaidStatus,
        cashMovements: [],
      };
    });

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => callback({
      $queryRaw: orderLock,
      order: { findUnique: balanceRead, update: vi.fn().mockResolvedValue({ id: "order-locked" }) },
      cashMovement: { create: vi.fn().mockResolvedValue({ id: "cash-locked" }) },
      paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-locked" }) },
      client: { update: vi.fn().mockResolvedValue({ id: "client-1" }) },
    }));

    const registration = registerPayment({
      orderId: "order-locked",
      idempotencyKey: nextIdempotencyKey(),
      amount: 1,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });
    await transactionBoundary;
    releaseLock();
    await registration;

    expect(events).toEqual(["lock-requested", "order-lock-acquired", "balance-read"]);
    expect(orderLock).toHaveBeenCalledTimes(1);
    expect(capturedLockSql).toMatch(/SELECT\s+[\s\S]*\s+FOR\s+UPDATE/i);
  });

  it("serializes concurrent same-order payments so committed whole pesos cannot exceed the balance", async () => {
    const { db } = await import("@/lib/db");
    let committedMovements: Array<{ id: string; total: number; orderId: string }> = [];
    let committedClientBalance = 10;
    let committedPaidStatus: PaidStatus = "inpago";
    let nextMovementId = 1;
    let transactionStarts = 0;
    let releaseBothStarted!: () => void;
    const bothStarted = new Promise<void>((resolve) => { releaseBothStarted = resolve; });
    let orderLocked = false;
    const lockWaiters: Array<() => void> = [];
    const lockCalls: string[] = [];
    const acquireOrderLock = async () => {
      if (!orderLocked) {
        orderLocked = true;
        return;
      }
      await new Promise<void>((resolve) => lockWaiters.push(resolve));
    };
    const releaseOrderLock = () => {
      const nextWaiter = lockWaiters.shift();
      if (nextWaiter) nextWaiter();
      else orderLocked = false;
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (callback) => {
      transactionStarts += 1;
      const transactionSnapshot = [...committedMovements];
      if (transactionStarts === 2) releaseBothStarted();
      await bothStarted;

      let visibleMovements = transactionSnapshot;
      let stagedMovement: { id: string; total: number; orderId: string } | undefined;
      let stagedClientDecrement = 0;
      let stagedPaidStatus: PaidStatus | undefined;
      let lockAcquired = false;
      const tx = {
        $queryRaw: vi.fn(async (query: TemplateStringsArray) => {
          const sql = query.join("?");
          lockCalls.push(sql);
          await acquireOrderLock();
          lockAcquired = true;
          // A PostgreSQL READ COMMITTED query after the parent-row lock observes
          // the movement committed by the preceding same-order transaction.
          visibleMovements = [...committedMovements];
          return [];
        }),
        order: {
          findUnique: vi.fn().mockImplementation(async () => ({
            id: "order-concurrent",
            total: 10,
            clientId: "client-concurrent",
            businessId: "business-123",
            paidStatus: committedPaidStatus,
            cashMovements: visibleMovements,
          })),
          update: vi.fn().mockImplementation(async ({ data }: { data: { paidStatus: PaidStatus } }) => {
            stagedPaidStatus = data.paidStatus;
          }),
        },
        cashMovement: {
          create: vi.fn().mockImplementation(async ({ data }: { data: { total: number; orderId: string } }) => {
            stagedMovement = { id: `cash-concurrent-${nextMovementId++}`, ...data };
            return stagedMovement;
          }),
        },
        paymentVoucher: { create: vi.fn().mockResolvedValue({ id: "voucher-concurrent" }) },
        client: {
          update: vi.fn().mockImplementation(async ({ data }: { data: { balance: { decrement: number } } }) => {
            stagedClientDecrement = data.balance.decrement;
          }),
        },
      };

      try {
        const result = await callback(tx);
        if (stagedMovement) committedMovements = [...committedMovements, stagedMovement];
        committedClientBalance -= stagedClientDecrement;
        if (stagedPaidStatus) committedPaidStatus = stagedPaidStatus;
        return result;
      } finally {
        if (lockAcquired) releaseOrderLock();
      }
    });

    const payment = {
      orderId: "order-concurrent",
      amount: 6,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B" as const,
      ptoVenta: CONFIGURED_PTO_VENTA,
    };
    const firstConfirmation = { ...payment, idempotencyKey: nextIdempotencyKey() };
    const secondConfirmation = { ...payment, idempotencyKey: nextIdempotencyKey() };
    const results = await Promise.all([
      registerPayment(firstConfirmation),
      registerPayment(secondConfirmation),
    ]);

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success)).toHaveLength(1);
    expect(results.find((result) => !result.success)).toEqual({
      success: false,
      error: "El pago no puede exceder el saldo pendiente",
    });
    expect(committedMovements).toHaveLength(1);
    expect(committedMovements.reduce((sum, movement) => sum + movement.total, 0)).toBeLessThanOrEqual(10);
    expect(committedMovements.map((movement) => movement.total)).toEqual([6]);
    expect(committedClientBalance).toBe(4);
    expect(committedPaidStatus).toBe("inpago");
    expect(lockCalls).toHaveLength(2);
    expect(lockCalls.every((sql) => /SELECT\s+[\s\S]*\s+FOR\s+UPDATE/i.test(sql))).toBe(true);
  });

  it("returns a generic safe message for unexpected database failures while preserving known domain messages", async () => {
    const { db } = await import("@/lib/db");
    const databaseFailure = new Error("DB_SECRET: customer_table connection string");
    databaseFailure.name = "PrismaClientKnownRequestError";
    databaseFailure.stack = "PRIVATE_STACK_TRACE";
    (db.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(databaseFailure);

    const result = await registerPayment({
      orderId: "order-db-failure",
      idempotencyKey: nextIdempotencyKey(),
      amount: 1,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(result).toEqual({
      success: false,
      error: "No se pudo registrar el pago. Intente nuevamente.",
    });
    expect(JSON.stringify(result)).not.toMatch(/DB_SECRET|customer_table|PrismaClientKnownRequestError|PRIVATE_STACK_TRACE/);
  });

  it("registra Remito sin POS con movimiento redondeado y estado NOT_REQUIRED en la misma transacción, sin emisión ni doble movimiento", async () => {
    const { db } = await import("@/lib/db");
    const { pusherServer } = await import("@/lib/pusher-server");
    const { revalidateTag } = await import("next/cache");
    const movementWrites: unknown[] = [];
    const voucherWrites: unknown[] = [];
    const transactionTrace: string[] = [];
    const orderUpdates: unknown[] = [];
    const clientUpdates: unknown[] = [];
    let transactionId = 0;
    let transactionCommitted = false;
    let pusherObservedCommittedTransaction = false;

    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      transactionId += 1;
      const currentTransactionId = transactionId;
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: "order-remito",
            total: 20,
            clientId: "client-remito",
            businessId: "business-123",
            paidStatus: "inpago",
            cashMovements: [],
          }),
          update: vi.fn(async (input: unknown) => {
            orderUpdates.push(input);
            return { id: "order-remito" };
          }),
        },
        cashMovement: {
          create: vi.fn(async (input: unknown) => {
            transactionTrace.push(`movement:${currentTransactionId}`);
            movementWrites.push(input);
            return { id: "cash-remito", total: 11 };
          }),
        },
        paymentVoucher: {
          create: vi.fn(async (input: unknown) => {
            transactionTrace.push(`voucher:${currentTransactionId}`);
            voucherWrites.push(input);
            return { id: "voucher-remito", status: "NOT_REQUIRED" };
          }),
        },
          client: {
            update: vi.fn(async (input: unknown) => {
              clientUpdates.push(input);
              return { id: "client-remito" };
            }),
          },
      };
      const result = await callback(tx as never);
      transactionCommitted = true;
      return result;
    });
    vi.mocked(pusherServer.trigger).mockImplementationOnce(async () => {
      pusherObservedCommittedTransaction = transactionCommitted;
      throw new Error("Pusher unavailable after payment commit");
    });
    vi.mocked(revalidateTag).mockImplementation(() => {
      throw new Error("Cache invalidation unavailable");
    });

    const result = await registerPayment({
      orderId: "order-remito",
      idempotencyKey: nextIdempotencyKey(),
      amount: 10.5,
      paymentMethod: "Efectivo",
      businessId: "business-123",
      billType: "Remito",
    });

    expect(result).toMatchObject({
      success: true,
      data: { paymentRecorded: true, voucherStatus: "NOT_REQUIRED" },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(movementWrites).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ total: 11, orderId: "order-remito" }) }),
    ]);
    expect(voucherWrites).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          cashMovementId: "cash-remito",
          status: "NOT_REQUIRED",
          billType: "Remito",
          amount: 11,
          afipVoucherType: null,
          invoiceNumber: null,
          invoicePointOfSale: null,
          cae: null,
          issuedAt: null,
          fiscalSnapshot: Prisma.DbNull,
          currentAttempt: 0,
        }),
      }),
    ]);
    expect(transactionTrace).toEqual(["movement:1", "voucher:1"]);
    expect(movementWrites).toHaveLength(1);
    expect(clientUpdates).toEqual([
      expect.objectContaining({
        where: { id: "client-remito" },
        data: { balance: { decrement: 11 } },
      }),
    ]);
    expect(orderUpdates).toEqual([
      expect.objectContaining({
        where: { id: "order-remito" },
        data: { paidStatus: "inpago" },
      }),
    ]);
    // registerPayment's only voucher/AFIP dispatch seam is intentionally bypassed for Remito.
    expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
    expect(pusherServer.trigger).toHaveBeenCalledTimes(1);
    expect(pusherObservedCommittedTransaction).toBe(true);
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    expect(vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag)).toEqual([
      CACHE_TAGS.ORDERS,
      CACHE_TAGS.CLIENTS,
      CACHE_TAGS.CASHBOX,
    ]);
    vi.mocked(revalidateTag).mockReset();
  });

  it("no conserva ni el pago ni NOT_REQUIRED si falla la transacción Remito", async () => {
    const { db } = await import("@/lib/db");
    const stagedPayments: unknown[] = [];
    const stagedVouchers: unknown[] = [];
    const committedPayments: unknown[] = [];
    const committedVouchers: unknown[] = [];
    const movementCreate = vi.fn(async (input: unknown) => {
      stagedPayments.push(input);
      return { id: "cash-remito-rollback", total: 11 };
    });
    const voucherCreate = vi.fn(async (input: unknown) => {
      stagedVouchers.push(input);
      throw new Error("simulated transaction failure");
    });

    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: "order-remito-rollback",
            total: 20,
            clientId: "client-1",
            businessId: "business-123",
            paidStatus: "inpago",
            cashMovements: [],
          }),
          update: vi.fn().mockResolvedValue({ id: "order-remito-rollback" }),
        },
        cashMovement: { create: movementCreate },
        paymentVoucher: { create: voucherCreate },
        client: { update: vi.fn().mockResolvedValue({ id: "client-1" }) },
      };
      try {
        const value = await callback(tx as never);
        committedPayments.push(...stagedPayments);
        committedVouchers.push(...stagedVouchers);
        return value;
      } catch (error) {
        throw error;
      }
    });

    const result = await registerPayment({
      orderId: "order-remito-rollback",
      idempotencyKey: nextIdempotencyKey(),
      amount: 10.5,
      paymentMethod: "Efectivo",
      businessId: "business-123",
      billType: "Remito",
    });

    expect(movementCreate).toHaveBeenCalledTimes(1);
    expect(voucherCreate).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(committedPayments).toEqual([]);
    expect(committedVouchers).toEqual([]);
    expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
  });

  it.each(["Factura A", "Factura B", "Factura C"] as const)(
    "mantiene POS obligatorio e intenta emitir una factura %s",
    async (billType) => {
      const { db } = await import("@/lib/db");
      const cashMovementCreate = vi.fn().mockResolvedValue({ id: `cash-${billType}` });
      vi.mocked(db.$transaction).mockImplementation(async (callback) => callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: "order-factura",
            total: 20,
            clientId: "client-1",
            businessId: "business-123",
            paidStatus: "inpago",
            cashMovements: [],
          }),
          update: vi.fn().mockResolvedValue({ id: "order-factura" }),
        },
        cashMovement: { create: cashMovementCreate },
        paymentVoucher: { create: vi.fn().mockResolvedValue({ id: `voucher-${billType}` }) },
        client: { update: vi.fn().mockResolvedValue({ id: "client-1" }) },
      } as never));

      const result = await registerPayment({
        orderId: "order-factura",
        idempotencyKey: nextIdempotencyKey(),
        amount: 10.5,
        paymentMethod: "Efectivo",
        businessId: "business-123",
        billType,
        ptoVenta: CONFIGURED_PTO_VENTA,
      });

      expect(result.success).toBe(true);
      expect(cashMovementCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ total: 11 }),
      }));
      expect(issuePaymentVoucherForSession).toHaveBeenCalledWith({
        cashMovementId: `cash-${billType}`,
        billType,
        ptoVenta: CONFIGURED_PTO_VENTA,
      });
    },
  );

  it.each(["Factura A", "Factura B", "Factura C"] as const)(
    "rechaza %s antes de persistir cuando no se propone POS",
    async (billType) => {
      const { db } = await import("@/lib/db");

      const result = await registerPayment({
        orderId: "order-factura-no-pos",
        idempotencyKey: nextIdempotencyKey(),
        amount: 10,
        paymentMethod: "Efectivo",
        businessId: "business-123",
        billType,
      });

      expect(result.success).toBe(false);
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
    },
  );

  it("reproduce un pago durable con la misma firma aunque el POS ya no esté configurado", async () => {
    const { db } = await import("@/lib/db");
    const { pusherServer } = await import("@/lib/pusher-server");
    const { revalidateTag } = await import("next/cache");
    const idempotencyKey = nextIdempotencyKey();
    const durablePaymentLookup = vi.fn().mockResolvedValue({
      id: "cash-committed-replay",
      total: 20,
      orderId: "order-durable-replay",
      paidMethod: "efectivo",
      paymentVoucher: {
        status: "ISSUED",
        billType: "Factura B",
        invoicePointOfSale: CONFIGURED_PTO_VENTA,
        currentAttempt: 1,
        attempts: [{
          attemptNumber: 1,
          billType: "Factura B",
          invoicePointOfSale: CONFIGURED_PTO_VENTA,
        }],
      },
    });
    (db as unknown as { cashMovement: { findUnique: typeof durablePaymentLookup } }).cashMovement = {
      findUnique: durablePaymentLookup,
    };
    vi.mocked(db.business.findUnique).mockResolvedValue({ ptoVenta: [] } as never);

    const result = await registerPayment({
      orderId: "order-durable-replay",
      idempotencyKey,
      amount: 20,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(result).toEqual({
      success: true,
      data: { paymentRecorded: true, voucherStatus: "ISSUED" },
    });
    expect(durablePaymentLookup).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        businessId_idempotencyKey: {
          businessId: "business-123",
          idempotencyKey,
        },
      },
    }));
    expect(db.business.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
    expect(pusherServer.trigger).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rechaza una firma distinta para una clave durable existente sin efectos", async () => {
    const { db } = await import("@/lib/db");
    const { pusherServer } = await import("@/lib/pusher-server");
    const { revalidateTag } = await import("next/cache");
    const idempotencyKey = nextIdempotencyKey();
    const durablePaymentLookup = vi.fn().mockResolvedValue({
      id: "cash-conflicting-replay",
      total: 20,
      orderId: "order-conflicting-replay",
      paidMethod: "efectivo",
      paymentVoucher: {
        status: "ISSUED",
        billType: "Factura B",
        invoicePointOfSale: CONFIGURED_PTO_VENTA,
        currentAttempt: 1,
        attempts: [{
          attemptNumber: 1,
          billType: "Factura B",
          invoicePointOfSale: CONFIGURED_PTO_VENTA,
        }],
      },
    });
    (db as unknown as { cashMovement: { findUnique: typeof durablePaymentLookup } }).cashMovement = {
      findUnique: durablePaymentLookup,
    };
    vi.mocked(db.business.findUnique).mockResolvedValue({ ptoVenta: [] } as never);

    const result = await registerPayment({
      orderId: "order-conflicting-replay",
      idempotencyKey,
      amount: 21,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    });

    expect(result).toEqual({
      success: false,
      error: "La clave de confirmación ya fue utilizada para otro pago",
    });
    expect(durablePaymentLookup).toHaveBeenCalledTimes(1);
    expect(db.business.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
    expect(pusherServer.trigger).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("no crea un segundo movimiento, intento ni emisión al repetir la confirmación", async () => {
    const { db } = await import("@/lib/db");
    const idempotencyKey = nextIdempotencyKey();
    let durablePayment: {
      id: string;
      total: number;
      orderId: string;
      paidMethod: string;
      paymentVoucher?: {
        status: string;
        billType: string;
        invoicePointOfSale: number;
        currentAttempt: number;
        attempts: Array<{ attemptNumber: number; billType: string; invoicePointOfSale: number }>;
      };
    } | null = null;
    const durablePaymentLookup = vi.fn(async () => durablePayment);
    (db as unknown as { cashMovement: { findUnique: typeof durablePaymentLookup } }).cashMovement = {
      findUnique: durablePaymentLookup,
    };
    const movementCreate = vi.fn(async ({ data }: { data: {
      total: number;
      orderId: string;
      paidMethod: string;
    } }) => {
      durablePayment = { id: "cash-repeated-confirmation", ...data };
      return durablePayment;
    });
    const voucherCreate = vi.fn(async ({ data }: { data: {
      status: string;
      billType: string;
      invoicePointOfSale: number;
      currentAttempt: number;
      attempts: { create: { attemptNumber: number; billType: string; invoicePointOfSale: number } };
    } }) => {
      if (durablePayment) {
        durablePayment.paymentVoucher = {
          status: "ISSUED",
          billType: data.billType,
          invoicePointOfSale: data.invoicePointOfSale,
          currentAttempt: data.currentAttempt,
          attempts: [{ ...data.attempts.create }],
        };
      }
      return { id: "voucher-repeated-confirmation" };
    });
    const clientUpdate = vi.fn().mockResolvedValue({ id: "client-1" });
    const orderUpdate = vi.fn().mockResolvedValue({ id: "order-repeated-confirmation" });

    vi.mocked(db.business.findUnique).mockResolvedValue({ ptoVenta: [CONFIGURED_PTO_VENTA] } as never);
    vi.mocked(db.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback({
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: "order-repeated-confirmation",
          total: 100,
          clientId: "client-1",
          businessId: "business-123",
          paidStatus: "inpago",
          client: { id: "client-1", name: "Cliente de prueba" },
          cashMovements: [],
        }),
        update: orderUpdate,
      },
      cashMovement: {
        findUnique: vi.fn(async () => durablePayment),
        create: movementCreate,
      },
      paymentVoucher: { create: voucherCreate },
      client: { update: clientUpdate },
    } as never));

    const request = {
      orderId: "order-repeated-confirmation",
      idempotencyKey,
      amount: 20,
      paymentMethod: "efectivo",
      businessId: "business-123",
      billType: "Factura B",
      ptoVenta: CONFIGURED_PTO_VENTA,
    };
    const firstResult = await registerPayment(request);
    vi.mocked(db.business.findUnique).mockResolvedValue({ ptoVenta: [] } as never);
    const replayResult = await registerPayment(request);

    expect(firstResult).toEqual({
      success: true,
      data: { paymentRecorded: true, voucherStatus: "ISSUED" },
    });
    expect(replayResult).toEqual(firstResult);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(movementCreate).toHaveBeenCalledTimes(1);
    expect(voucherCreate).toHaveBeenCalledTimes(1);
    expect(voucherCreate.mock.calls[0]?.[0].data.attempts.create).toMatchObject({
      attemptNumber: 1,
      billType: "Factura B",
      invoicePointOfSale: CONFIGURED_PTO_VENTA,
    });
    expect(clientUpdate).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledTimes(1);
    expect(issuePaymentVoucherForSession).toHaveBeenCalledTimes(1);
    expect(durablePayment).toMatchObject({
      id: "cash-repeated-confirmation",
      total: 20,
      paymentVoucher: { status: "ISSUED", currentAttempt: 1 },
    });
  });
});
