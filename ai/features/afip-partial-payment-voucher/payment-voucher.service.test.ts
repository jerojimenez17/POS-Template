import { describe, expect, it, vi } from "vitest";

declare global {
  interface ImportMeta {
    glob: <Module>(pattern: string) => Record<string, () => Promise<Module>>;
  }
}

interface ServiceDependencies {
  auth: () => Promise<{ user: { id: string; businessId: string } }>;
  repository: {
    findPayment: (id: string, businessId: string) => Promise<Record<string, unknown> | null>;
    isAfipEligible: (businessId: string) => Promise<boolean>;
    claim: (input: Record<string, unknown>) => Promise<{ status: string; attempt: number; acquired: boolean }>;
    markDispatched: (input: Record<string, unknown>) => Promise<void>;
    persistAuthorized: (input: Record<string, unknown>) => Promise<void>;
    persistFailure: (input: Record<string, unknown>) => Promise<void>;
    getVoucher: (paymentId: string, businessId: string) => Promise<Record<string, unknown> | null>;
    transaction: <T>(callback: () => Promise<T>) => Promise<T>;
  };
  afip: {
    prepare: (invoice: Record<string, unknown>) => Promise<{ ok: true; capability: unknown }>;
    issue: (capability: unknown, onDispatch?: () => Promise<void>) => Promise<{
      kind: "authorized";
      total: number | string;
      cae: string;
      invoiceNumber: number;
      pointOfSale: number;
      issuedAt: Date;
    }>;
    reconcile: (paymentId: string) => Promise<{ kind: "unresolved" }>;
  };
}

interface PaymentVoucherService {
  issue: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  print: (input: { cashMovementId: string }) => Promise<Record<string, unknown>>;
}

async function loadService(dependencies: ServiceDependencies): Promise<PaymentVoucherService> {
  const modules = import.meta.glob<{
    createPaymentVoucherService: (deps: ServiceDependencies) => PaymentVoucherService;
  }>("/src/lib/server/payment-voucher.ts");
  const loadModule = Object.values(modules)[0];
  if (!loadModule) throw new Error("Expected payment voucher service implementation");
  return (await loadModule()).createPaymentVoucherService(dependencies);
}

function serviceFixture(afipTotal: number | string) {
  const payment = {
    id: "movement-1",
    businessId: "business-1",
    total: 123,
    business: { ptoVenta: [3] },
    order: {
      id: "order-1",
      businessId: "business-1",
      total: 900,
      client: { id: "client-1", name: "Test customer", documentNumber: "20123456789", ivaCondition: "Consumidor Final" },
      invoice: { cae: "ORIGINAL-CAE", billType: "Factura B", invoiceNumber: 9 },
    },
  };
  let persistedVoucher: Record<string, unknown> | null = null;
  const mocks = {
    issue: vi.fn(async (_capability: unknown, onDispatch?: () => Promise<void>) => {
      await onDispatch?.();
      return {
        kind: "authorized" as const,
        total: afipTotal,
        cae: "12345678901234",
        invoiceNumber: 77,
        pointOfSale: 3,
        issuedAt: new Date("2026-10-01T12:00:00.000Z"),
        providerDebug: "must-not-be-persisted-or-returned",
      };
    }),
    claim: vi.fn().mockResolvedValue({ status: "ISSUING", attempt: 1, acquired: true }),
    persistAuthorized: vi.fn(async (input: Record<string, unknown>) => {
      persistedVoucher = { ...input };
    }),
    persistFailure: vi.fn(async (input: Record<string, unknown>) => {
      persistedVoucher = {
        status: input.status,
        amount: 123,
        total: 123,
        currentAttempt: 1,
        lastErrorCode: input.safeErrorCode,
        observedTotal: input.observedTotalPesos,
      };
    }),
    getVoucher: vi.fn(async () => persistedVoucher),
  };
  const dependencies: ServiceDependencies = {
    auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-1" } }),
    repository: {
      findPayment: vi.fn().mockResolvedValue(payment),
      isAfipEligible: vi.fn().mockResolvedValue(true),
      claim: mocks.claim,
      markDispatched: vi.fn().mockResolvedValue(undefined),
      persistAuthorized: mocks.persistAuthorized,
      persistFailure: mocks.persistFailure,
      getVoucher: mocks.getVoucher,
      transaction: vi.fn(async <T>(callback: () => Promise<T>) => callback()) as ServiceDependencies["repository"]["transaction"],
    },
    afip: {
      prepare: vi.fn().mockResolvedValue({ ok: true, capability: "prepared" }),
      issue: mocks.issue,
      reconcile: vi.fn().mockResolvedValue({ kind: "unresolved" }),
    },
  };
  return { dependencies, mocks, payment, getPersistedVoucher: () => persistedVoucher };
}

describe("payment voucher service trusted AFIP amount evidence", () => {
  it.each([123, "123", "123.0", "123.00"])(
    "authorizes an exact whole-peso AFIP total %s for a stored payment of 123",
    async (total) => {
      const { dependencies, mocks } = serviceFixture(total);
      const service = await loadService(dependencies);

      const result = await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 });

      expect(result).toMatchObject({ voucherStatus: "AUTHORIZED" });
      expect(mocks.persistAuthorized).toHaveBeenCalledWith(expect.objectContaining({ amount: 123, total: 123 }));
      expect(mocks.persistFailure).not.toHaveBeenCalled();
    },
  );

  it.each([123.4, "123.4"])(
    "does not round trusted AFIP total %s to the stored 123-peso payment",
    async (total) => {
      const { dependencies, mocks, payment, getPersistedVoucher } = serviceFixture(total);
      const service = await loadService(dependencies);

      const result = await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 });

      expect(result).toMatchObject({ paymentRecorded: true, voucherStatus: "UNKNOWN", reconciliationRequired: true });
      expect(mocks.persistAuthorized).not.toHaveBeenCalled();
      expect(mocks.persistFailure).toHaveBeenCalledWith(expect.objectContaining({
        status: "UNKNOWN",
        safeErrorCode: "TOTAL_MISMATCH",
        observedTotalPesos: 123.4,
      }));
      expect(getPersistedVoucher()).toMatchObject({ status: "UNKNOWN", lastErrorCode: "TOTAL_MISMATCH" });
      expect(result).not.toHaveProperty("providerDebug");
      expect(mocks.persistFailure.mock.calls.flatMap(([input]) => Object.values(input)))
        .not.toContain("must-not-be-persisted-or-returned");
      expect(payment.total).toBe(123);
      expect(payment.order.total).toBe(900);

      await expect(service.print({ cashMovementId: "movement-1" })).rejects.toThrow(/no está autorizado para impresión/i);
      const replay = await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3, retry: true });
      expect(replay).toMatchObject({ voucherStatus: "UNKNOWN", reconciliationRequired: true });
      expect(mocks.claim).toHaveBeenCalledTimes(1);
      expect(mocks.issue).toHaveBeenCalledTimes(1);
    },
  );
});
