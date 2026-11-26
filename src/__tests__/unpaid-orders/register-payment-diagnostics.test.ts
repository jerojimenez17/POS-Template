// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPayment } from "@/actions/unpaid-orders";
import { issuePaymentVoucherForSession } from "@/lib/server/payment-voucher";

const { businessId } = vi.hoisted(() => ({ businessId: "business-synthetic" }));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    business: { findUnique: vi.fn().mockResolvedValue({ ptoVenta: [7] }) },
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { businessId } }),
}));

vi.mock("@/lib/server/payment-voucher", () => ({
  issuePaymentVoucherForSession: vi.fn().mockResolvedValue({ paymentRecorded: true, voucherStatus: "AUTHORIZED" }),
}));

vi.mock("@/lib/pusher-server", () => ({
  pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

type FailureBoundary =
  | "pos-lookup"
  | "transaction-lock"
  | "idempotency"
  | "load-balance"
  | "movement"
  | "voucher-reservation"
  | "client-accounting"
  | "order-accounting"
  | "commit";

const safePrismaCode = "P2021";
const sensitiveMarkers = [
  "SYNTHETIC_PRIVATE_MESSAGE",
  "SYNTHETIC_PRIVATE_STACK",
  "SYNTHETIC_PRIVATE_SQL",
  "SYNTHETIC_PRIVATE_PARAMETER",
];

const createSyntheticFailure = (): Error & { code: string; query: string; params: string } => {
  const error = new Error(`${sensitiveMarkers[0]} ${sensitiveMarkers[2]} ${sensitiveMarkers[3]}`) as
    Error & { code: string; query: string; params: string };
  error.name = "PrismaClientKnownRequestError";
  error.code = safePrismaCode;
  error.query = sensitiveMarkers[2];
  error.params = sensitiveMarkers[3];
  error.stack = sensitiveMarkers[1];
  return error;
};

const capturedLogs = (spy: ReturnType<typeof vi.spyOn>): string => JSON.stringify(
  spy.mock.calls,
  (_key, value: unknown) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
        ...Object.fromEntries(Object.entries(value)),
      };
    }
    return value;
  },
);

const paymentInput = (billType: "Remito" | "Factura B" = "Factura B") => ({
  orderId: "order-synthetic",
  idempotencyKey: "c91d6534-c340-4abe-b340-e875c4ef0999",
  amount: 12,
  paymentMethod: "efectivo",
  businessId,
  billType,
  ...(billType === "Factura B" ? { ptoVenta: 7 } : {}),
});

const installFailureHarness = async (boundary: FailureBoundary) => {
  const { db } = await import("@/lib/db");
  const { pusherServer } = await import("@/lib/pusher-server");
  const { revalidateTag } = await import("next/cache");
  if (boundary === "pos-lookup") {
    vi.mocked(db.business.findUnique).mockRejectedValueOnce(createSyntheticFailure());
  }
  const stagedWrites: string[] = [];
  const committedWrites: string[] = [];
  const fault = () => { throw createSyntheticFailure(); };

  const tx = {
    $queryRaw: vi.fn(async () => {
      if (boundary === "transaction-lock") fault();
      return [];
    }),
    cashMovement: {
      findUnique: vi.fn(async () => {
        if (boundary === "idempotency") fault();
        return null;
      }),
      create: vi.fn(async () => {
        if (boundary === "movement") fault();
        stagedWrites.push("movement");
        return { id: "movement-synthetic", total: 12, orderId: "order-synthetic" };
      }),
    },
    order: {
      findUnique: vi.fn(async () => {
        if (boundary === "load-balance") fault();
        return {
          id: "order-synthetic",
          businessId,
          total: 30,
          clientId: "client-synthetic",
          paidStatus: "inpago",
          cashMovements: [],
        };
      }),
      update: vi.fn(async () => {
        if (boundary === "order-accounting") fault();
        stagedWrites.push("order-accounting");
        return { id: "order-synthetic" };
      }),
    },
    paymentVoucher: {
      create: vi.fn(async () => {
        if (boundary === "voucher-reservation") fault();
        stagedWrites.push("voucher");
        return { id: "voucher-synthetic", status: "NOT_REQUIRED" };
      }),
    },
    client: {
      update: vi.fn(async () => {
        if (boundary === "client-accounting") fault();
        stagedWrites.push("client-accounting");
        return { id: "client-synthetic" };
      }),
    },
  };

  vi.mocked(db.$transaction).mockImplementation(async (callback: (transaction: never) => Promise<unknown>) => {
    const result = await callback(tx as never);
    if (boundary === "commit") fault();
    committedWrites.push(...stagedWrites);
    return result;
  });

  return { db, pusherServer, revalidateTag, stagedWrites, committedWrites };
};

describe("registerPayment safe diagnostics at critical boundaries", () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["pos-lookup", "pos-lookup"],
    ["transaction-lock", "transaction-lock"],
    ["idempotency", "idempotency"],
    ["load-balance", "load-balance"],
    ["movement", "movement"],
    ["voucher-reservation", "voucher-reservation"],
    ["client-accounting", "client-accounting"],
    ["order-accounting", "order-accounting"],
    ["commit", "commit"],
  ] as const)("logs only an allowlisted diagnostic for a %s failure and does not report success", async (boundary, expectedPhase) => {
    const harness = await installFailureHarness(boundary);

    const result = await registerPayment(paymentInput());

    expect(result).toMatchObject({ success: false });
    expect(result).not.toMatchObject({ success: true, data: { paymentRecorded: true } });
    expect(harness.committedWrites).toEqual([]);
    expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
    expect(harness.pusherServer.trigger).not.toHaveBeenCalled();
    expect(harness.revalidateTag).not.toHaveBeenCalled();

    const logOutput = capturedLogs(errorLog);
    const resultOutput = JSON.stringify(result);
    expect.soft(logOutput).toContain(expectedPhase);
    expect.soft(logOutput).toContain(safePrismaCode);
    for (const marker of sensitiveMarkers) {
      expect.soft(logOutput).not.toContain(marker);
      expect.soft(resultOutput).not.toContain(marker);
    }
    expect.soft(logOutput).not.toMatch(/stack|query|params|sql/i);
  });

  it("rolls back a Remito payment when NOT_REQUIRED cannot be persisted and never dispatches AFIP", async () => {
    const harness = await installFailureHarness("voucher-reservation");

    const result = await registerPayment(paymentInput("Remito"));

    expect(result).toMatchObject({ success: false });
    expect(result).not.toMatchObject({ data: { paymentRecorded: true, voucherStatus: "NOT_REQUIRED" } });
    expect(harness.stagedWrites).toEqual(["movement"]);
    expect(harness.committedWrites).toEqual([]);
    expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
    expect(harness.pusherServer.trigger).not.toHaveBeenCalled();
    expect(harness.revalidateTag).not.toHaveBeenCalled();
  });
});
