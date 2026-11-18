import { describe, expect, it, vi } from "vitest";

declare global {
  interface ImportMeta {
    glob: <Module>(pattern: string) => Record<string, () => Promise<Module>>;
  }
}

interface ReconciliationDependencies {
  auth: () => Promise<{ user: { id: string; businessId: string } }>;
  repository: {
    findPayment: (id: string, businessId: string) => Promise<Record<string, unknown> | null>;
    isAfipEligible: (businessId: string) => Promise<boolean>;
    claim: (input: Record<string, unknown>) => Promise<{ status: string; attempt: number; acquired: boolean }>;
    persistAuthorized: (input: Record<string, unknown>) => Promise<void>;
    persistFailure: (input: Record<string, unknown>) => Promise<void>;
    getVoucher: (paymentId: string, businessId: string) => Promise<Record<string, unknown> | null>;
    transaction: <T>(callback: () => Promise<T>) => Promise<T>;
  };
  afip: {
    prepare: (invoice: Record<string, unknown>) => Promise<{ ok: true; capability: unknown }>;
    issue: (capability: unknown) => Promise<{ kind: "rejected" }>;
    reconcile: (paymentId: string) => Promise<{ kind: "authorized"; voucher: Record<string, unknown> }>;
  };
}

interface PaymentVoucherService {
  issue: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  reconcile: (input: { cashMovementId: string }) => Promise<Record<string, unknown>>;
  print: (input: { cashMovementId: string }) => Promise<Record<string, unknown>>;
}

async function loadService(dependencies: ReconciliationDependencies): Promise<PaymentVoucherService> {
  const modules = import.meta.glob<{
    createPaymentVoucherService: (deps: ReconciliationDependencies) => PaymentVoucherService;
  }>("/src/lib/server/payment-voucher.ts");
  const loadModule = Object.values(modules)[0];
  if (!loadModule) throw new Error("Expected payment voucher service implementation");
  return (await loadModule()).createPaymentVoucherService(dependencies);
}

function reconciliationFixture(remoteTotal: number | string) {
  const payment = {
    id: "movement-1",
    businessId: "business-1",
    total: 123,
    order: { id: "order-1", businessId: "business-1", total: 900, client: { id: "client-1", name: "Customer" } },
  };
  const currentVoucher = {
    status: "UNKNOWN",
    amount: 123,
    total: 123,
    currentAttempt: 2,
    lastErrorCode: "TOTAL_MISMATCH",
    observedTotal: 123.4,
  };
  const remoteEvidence = {
    cae: "12345678901234",
    total: remoteTotal,
    billType: "Factura B",
    afipVoucherType: 6,
    invoiceNumber: 77,
    pointOfSale: 3,
    issuedAt: new Date("2026-10-01T12:00:00.000Z"),
    providerDebug: "must-not-be-returned-or-persisted",
  };
  const mocks = {
    issue: vi.fn().mockResolvedValue({ kind: "rejected" as const }),
    reconcile: vi.fn().mockResolvedValue({ kind: "authorized" as const, voucher: remoteEvidence }),
    persistAuthorized: vi.fn().mockResolvedValue(undefined),
    persistFailure: vi.fn().mockResolvedValue(undefined),
    getVoucher: vi.fn().mockResolvedValue(currentVoucher),
  };
  const dependencies: ReconciliationDependencies = {
    auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-1" } }),
    repository: {
      findPayment: vi.fn().mockResolvedValue(payment),
      isAfipEligible: vi.fn().mockResolvedValue(true),
      claim: vi.fn().mockResolvedValue({ status: "UNKNOWN", attempt: 2, acquired: false }),
      persistAuthorized: mocks.persistAuthorized,
      persistFailure: mocks.persistFailure,
      getVoucher: mocks.getVoucher,
      transaction: vi.fn(<T>(callback: () => Promise<T>): Promise<T> => callback()) as ReconciliationDependencies["repository"]["transaction"],
    },
    afip: {
      prepare: vi.fn().mockResolvedValue({ ok: true, capability: "prepared" }),
      issue: mocks.issue,
      reconcile: mocks.reconcile,
    },
  };
  return { dependencies, mocks, payment, currentVoucher, remoteEvidence };
}

describe("payment voucher authoritative reconciliation exact-total contract", () => {
  it.each([123.4, "123.4"])(
    "keeps fractional authoritative total %s unresolved and unattached",
    async (total) => {
      const { dependencies, mocks, payment, currentVoucher, remoteEvidence } = reconciliationFixture(total);
      const service = await loadService(dependencies);

      const result = await service.reconcile({ cashMovementId: "movement-1" });

      expect(result).toMatchObject({ status: "UNKNOWN", reconciliationRequired: true });
      expect(result).not.toHaveProperty("providerDebug");
      expect(mocks.persistAuthorized).not.toHaveBeenCalled();
      expect(mocks.persistFailure).toHaveBeenCalledWith(expect.objectContaining({
        status: "UNKNOWN",
        safeErrorCode: "TOTAL_MISMATCH",
        observedTotalPesos: 123.4,
      }));
      expect(mocks.persistFailure.mock.calls.flatMap(([input]) => Object.values(input))).not.toContain(remoteEvidence.providerDebug);
      expect(payment.total).toBe(123);
      expect(payment.order.total).toBe(900);
      expect(currentVoucher.status).toBe("UNKNOWN");

      await expect(service.print({ cashMovementId: "movement-1" })).rejects.toThrow(/no está autorizado para impresión/i);
      const replay = await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3, retry: true });
      expect(replay).toMatchObject({ voucherStatus: "UNKNOWN", reconciliationRequired: true });
      expect(mocks.issue).not.toHaveBeenCalled();
    },
  );

  it.each([123, "123", "123.0", "123.00"])(
    "attaches and authorizes exact reconciled total %s only",
    async (total) => {
      const { dependencies, mocks, payment, remoteEvidence } = reconciliationFixture(total);
      const service = await loadService(dependencies);

      const result = await service.reconcile({ cashMovementId: "movement-1" });

      expect(result).toEqual({ status: "AUTHORIZED" });
      expect(mocks.persistAuthorized).toHaveBeenCalledWith(expect.objectContaining({
        status: "AUTHORIZED",
        amountPesos: 123,
        total,
        cae: "12345678901234",
      }));
      expect(mocks.persistAuthorized.mock.calls[0]?.[0]).not.toHaveProperty("providerDebug");
      expect(mocks.persistFailure).not.toHaveBeenCalled();
      expect(payment.total).toBe(123);
      expect(payment.order.total).toBe(900);
      expect(mocks.issue).not.toHaveBeenCalled();
      expect(remoteEvidence.providerDebug).toBe("must-not-be-returned-or-persisted");
    },
  );
});
