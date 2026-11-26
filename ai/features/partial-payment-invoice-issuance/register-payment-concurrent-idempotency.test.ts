// @vitest-environment node
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrRetryPaymentVoucherAction } from "@/actions/payment-voucher";
import { registerPayment } from "@/actions/unpaid-orders";
import { getPaymentVoucherForSession, issuePaymentVoucherForSession } from "@/lib/server/payment-voucher";

const { businessId, idempotencyKey, replayAfterRetryKey } = vi.hoisted(() => ({
  businessId: "business-idempotency-regression",
  idempotencyKey: "63bc0b30-c47b-4acf-b48c-750977e4423a",
  replayAfterRetryKey: "f04b9a9f-8b30-4e2e-9fd1-e5d683a92647",
}));

interface VoucherAttempt {
  attemptNumber: number;
  status: string;
  billType: string;
  invoicePointOfSale: number;
}

interface MovementVoucher {
  status: string;
  billType: string;
  invoicePointOfSale: number;
  currentAttempt: number;
  attempts: VoucherAttempt[];
}

let committedMovement: {
  id: string;
  total: number;
  orderId: string;
  paidMethod: string;
  businessId: string;
  idempotencyKey: string;
  paymentVoucher?: MovementVoucher;
} | null = null;
let preflightLookupCount = 0;
let releasePreflight!: () => void;
let preflightBarrier: Promise<void>;
let orderIsLocked = false;
const orderLockWaiters: Array<() => void> = [];
let movementWrites = 0;
let voucherWrites = 0;
let clientBalanceDecrements: number[] = [];
let paidStatusWrites: string[] = [];
let attemptWrites = 0;
let orderTotal = 123;

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    business: { findUnique: vi.fn().mockResolvedValue({ ptoVenta: [7] }) },
    cashMovement: {
      findUnique: vi.fn(async () => {
        preflightLookupCount += 1;
        if (preflightLookupCount <= 2) {
          if (preflightLookupCount === 2) releasePreflight();
          await preflightBarrier;
          return null;
        }
        return committedMovement;
      }),
    },
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId } }),
}));

vi.mock("@/lib/server/payment-voucher", () => ({
  getPaymentVoucherForSession: vi.fn(),
  issuePaymentVoucherForSession: vi.fn().mockResolvedValue({
    paymentRecorded: true,
    voucherStatus: "PENDING",
  }),
}));

vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

function makeUniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique idempotency key", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("concurrencia de registerPayment con una misma clave", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    committedMovement = null;
    preflightLookupCount = 0;
    orderIsLocked = false;
    orderLockWaiters.length = 0;
    movementWrites = 0;
    voucherWrites = 0;
    attemptWrites = 0;
    orderTotal = 123;
    clientBalanceDecrements = [];
    paidStatusWrites = [];
    preflightBarrier = new Promise<void>((resolve) => { releasePreflight = resolve; });

    const { db } = await import("@/lib/db");
    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      let stagedMovement: typeof committedMovement = null;
      let hasLock = false;
      const acquireOrderLock = async () => {
        if (!orderIsLocked) {
          orderIsLocked = true;
          hasLock = true;
          return;
        }
        await new Promise<void>((resolve) => orderLockWaiters.push(resolve));
        hasLock = true;
      };
      const releaseOrderLock = () => {
        const next = orderLockWaiters.shift();
        if (next) next();
        else orderIsLocked = false;
      };

      const tx = {
        $queryRaw: vi.fn(async () => {
          await acquireOrderLock();
          return [];
        }),
        order: {
          findUnique: vi.fn(async () => ({
            id: "order-1",
            businessId,
            total: orderTotal,
            paidStatus: "inpago",
            clientId: "client-1",
            client: { id: "client-1", name: "Destinatario" },
            cashMovements: committedMovement ? [{ id: committedMovement.id, total: committedMovement.total }] : [],
          })),
          update: vi.fn(async ({ data }: { data: { paidStatus: string } }) => {
            paidStatusWrites.push(data.paidStatus);
            return { id: "order-1" };
          }),
        },
        cashMovement: {
          findUnique: vi.fn(async () => committedMovement),
          create: vi.fn(async ({ data }: { data: Omit<NonNullable<typeof committedMovement>, "id"> }) => {
            if (committedMovement?.idempotencyKey === data.idempotencyKey) throw makeUniqueConstraintError();
            movementWrites += 1;
            stagedMovement = { id: "movement-1", ...data };
            return stagedMovement;
          }),
        },
        paymentVoucher: {
          create: vi.fn(async ({ data }: { data: {
            status: string;
            billType: string;
            invoicePointOfSale: number;
            currentAttempt: number;
            attempts: { create: VoucherAttempt };
          } }) => {
            voucherWrites += 1;
            attemptWrites += 1;
            if (stagedMovement) {
              stagedMovement.paymentVoucher = {
                status: data.status,
                billType: data.billType,
                invoicePointOfSale: data.invoicePointOfSale,
                currentAttempt: data.currentAttempt,
                attempts: [{ ...data.attempts.create }],
              };
            }
            return { id: "voucher-1" };
          }),
        },
        client: {
          update: vi.fn(async ({ data }: { data: { balance: { decrement: number } } }) => {
            clientBalanceDecrements.push(data.balance.decrement);
            return { id: "client-1" };
          }),
        },
      };

      try {
        const result = await callback(tx as never);
        if (stagedMovement) committedMovement = stagedMovement;
        return result;
      } finally {
        if (hasLock) releaseOrderLock();
      }
    });
    vi.mocked(db.business.findUnique).mockResolvedValue({ ptoVenta: [7] } as never);
    vi.mocked(issuePaymentVoucherForSession).mockResolvedValue({
      paymentRecorded: true,
      voucherStatus: "PENDING",
    });
  });

  it("devuelve la misma confirmación cuando la primera llamada concurrente consume todo el saldo", async () => {
    const request = {
      orderId: "order-1",
      idempotencyKey,
      amount: 123,
      paymentMethod: "efectivo",
      businessId,
      billType: "Factura B",
      ptoVenta: 7,
    };

    const results = await Promise.all([registerPayment(request), registerPayment(request)]);

    expect(results).toEqual([
      { success: true, data: { paymentRecorded: true, voucherStatus: "PENDING" } },
      { success: true, data: { paymentRecorded: true, voucherStatus: "PENDING" } },
    ]);
    expect(committedMovement).toMatchObject({
      id: "movement-1",
      total: 123,
      orderId: "order-1",
      idempotencyKey,
      paymentVoucher: { status: "PENDING", billType: "Factura B", invoicePointOfSale: 7 },
    });
    expect(movementWrites).toBe(1);
    expect(voucherWrites).toBe(1);
    expect(clientBalanceDecrements).toEqual([123]);
    expect(paidStatusWrites).toEqual(["pago"]);
    expect(issuePaymentVoucherForSession).toHaveBeenCalledTimes(1);
  });

  it("reproduce la confirmación original tras retry FAILED con selección fiscal distinta", async () => {
    const { db } = await import("@/lib/db");
    orderTotal = 500;
    vi.mocked(db.business.findUnique).mockResolvedValue({ ptoVenta: [7, 8] } as never);
    releasePreflight();

    const originalRequest = {
      orderId: "order-1",
      idempotencyKey: replayAfterRetryKey,
      amount: 123,
      paymentMethod: "efectivo",
      businessId,
      billType: "Factura A",
      ptoVenta: 7,
    };
    const issuanceCalls: Array<{ billType: string; ptoVenta: number; retry: boolean }> = [];
    vi.mocked(issuePaymentVoucherForSession).mockImplementation(async (input) => {
      const retry = input.retry === true;
      const billType = String(input.billType);
      const ptoVenta = Number(input.ptoVenta);
      issuanceCalls.push({ billType, ptoVenta, retry });

      const voucher = committedMovement?.paymentVoucher;
      if (!voucher) throw new Error("Expected committed payment voucher reservation");
      if (retry) {
        if (voucher.status !== "FAILED") throw new Error("Explicit retry requires a FAILED voucher");
        voucher.currentAttempt += 1;
        voucher.status = "PENDING";
        voucher.billType = billType;
        voucher.invoicePointOfSale = ptoVenta;
        voucher.attempts.push({
          attemptNumber: voucher.currentAttempt,
          status: "PREPARING",
          billType,
          invoicePointOfSale: ptoVenta,
        });
        attemptWrites += 1;
        return { paymentRecorded: true, voucherStatus: "PENDING" };
      }

      voucher.status = "FAILED";
      voucher.attempts[0]!.status = "FAILED";
      return { paymentRecorded: true, voucherStatus: "FAILED" };
    });
    vi.mocked(getPaymentVoucherForSession).mockImplementation(async () => ({
      status: committedMovement?.paymentVoucher?.status ?? "MISSING",
    } as never));

    const initialResult = await registerPayment(originalRequest);
    expect(initialResult).toEqual({
      success: true,
      data: { paymentRecorded: true, voucherStatus: "FAILED" },
    });
    expect(committedMovement).toMatchObject({
      id: "movement-1",
      total: 123,
      paymentVoucher: {
        status: "FAILED",
        billType: "Factura A",
        invoicePointOfSale: 7,
        currentAttempt: 1,
        attempts: [{ attemptNumber: 1, status: "FAILED", billType: "Factura A", invoicePointOfSale: 7 }],
      },
    });

    const retryResult = await createOrRetryPaymentVoucherAction({
      cashMovementId: "movement-1",
      billType: "Factura B",
      ptoVenta: 8,
      retry: true,
    });
    expect(retryResult).toEqual({ paymentRecorded: true, voucherStatus: "PENDING" });
    expect(committedMovement?.paymentVoucher).toMatchObject({
      status: "PENDING",
      billType: "Factura B",
      invoicePointOfSale: 8,
      currentAttempt: 2,
      attempts: [
        { attemptNumber: 1, status: "FAILED", billType: "Factura A", invoicePointOfSale: 7 },
        { attemptNumber: 2, status: "PREPARING", billType: "Factura B", invoicePointOfSale: 8 },
      ],
    });

    const movementAfterRetry = structuredClone(committedMovement);
    const movementWritesAfterRetry = movementWrites;
    const voucherWritesAfterRetry = voucherWrites;
    const attemptWritesAfterRetry = attemptWrites;
    const clientBalanceAfterRetry = [...clientBalanceDecrements];
    const paidStatusAfterRetry = [...paidStatusWrites];
    const issuanceCallsAfterRetry = [...issuanceCalls];

    const replayResult = await registerPayment(originalRequest);

    expect(replayResult).toEqual({
      success: true,
      data: { paymentRecorded: true, voucherStatus: "PENDING" },
    });
    expect(committedMovement).toEqual(movementAfterRetry);
    expect(movementWrites).toBe(movementWritesAfterRetry);
    expect(voucherWrites).toBe(voucherWritesAfterRetry);
    expect(attemptWrites).toBe(attemptWritesAfterRetry);
    expect(clientBalanceDecrements).toEqual(clientBalanceAfterRetry);
    expect(paidStatusWrites).toEqual(paidStatusAfterRetry);
    expect(issuanceCalls).toEqual(issuanceCallsAfterRetry);
    expect(issuanceCalls).toEqual([
      { billType: "Factura A", ptoVenta: 7, retry: false },
      { billType: "Factura B", ptoVenta: 8, retry: true },
    ]);
    expect(movementWrites).toBe(1);
    expect(voucherWrites).toBe(1);
    expect(attemptWrites).toBe(2);
    expect(clientBalanceDecrements).toEqual([123]);
    expect(paidStatusWrites).toEqual(["inpago"]);
  });
});
