import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerPayment } from "@/actions/unpaid-orders";

vi.mock("@/lib/db", () => {
  return {
    db: {
      $transaction: vi.fn(),
    },
  };
});

vi.mock("../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { businessId: "business-123" } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("registerPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
          order: {
            findUnique: vi.fn().mockResolvedValue(orderWithPartialPayment),
            update: orderUpdateSpy,
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-3" }),
          },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await registerPayment({
      orderId: "order-1",
      amount: 20,
      paymentMethod: "efectivo",
      businessId: "business-123",
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
          order: {
            findUnique: vi.fn().mockResolvedValue(orderWithoutPreviousPayments),
            update: orderUpdateSpy,
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-1" }),
          },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await registerPayment({
      orderId: "order-1",
      amount: 100,
      paymentMethod: "efectivo",
      businessId: "business-123",
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
          order: {
            findUnique: vi.fn().mockResolvedValue(orderWithPartialPayment),
            update: orderUpdateSpy,
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-2" }),
          },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await registerPayment({
      orderId: "order-1",
      amount: 20,
      paymentMethod: "efectivo",
      businessId: "business-123",
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
          order: {
            findUnique: vi.fn().mockResolvedValue(order),
            update: orderUpdateSpy,
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-4" }),
          },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await registerPayment({
      orderId: "order-1",
      amount: 25,
      paymentMethod: "efectivo",
      businessId: "business-123",
    });

    expect(result.success).toBe(true);
    expect(orderUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1" },
        data: { paidStatus: "pago" },
      })
    );
  });
});