// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPaymentVoucherService,
  paymentVoucherService,
  type PaymentVoucherDependencies,
} from "@/lib/server/payment-voucher";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
    business: { findUnique: vi.fn() },
    cashMovement: { findFirst: vi.fn() },
    paymentVoucher: { findFirst: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-1", role: "ADMIN" } }),
}));

const authorizedRemoteResult = {
  kind: "authorized" as const,
  total: "123.00",
  cae: "12345678901234",
  invoiceNumber: 901,
  pointOfSale: 7,
  issuedAt: new Date("2025-04-03T12:00:00.000Z"),
};

const createServiceHarness = (options?: {
  initialStatus?: string;
  prepareFailure?: boolean;
  dispatchMarkerFailure?: boolean;
  persistAuthorizationFailure?: boolean;
  remoteBehavior?: "timeout" | "authorized";
}) => {
  let durableStatus = options?.initialStatus ?? "MISSING";
  let attemptNumber = durableStatus === "FAILED" ? 1 : 1;
  const post = vi.fn();
  const reconcileRemote = vi.fn().mockResolvedValue({ kind: "unresolved" });
  const persistFailure = vi.fn(async (input: Record<string, unknown>) => {
    durableStatus = String(input.status);
  });
  const persistAuthorized = vi.fn(async () => {
    if (options?.persistAuthorizationFailure) throw new Error("authorized persistence unavailable");
    durableStatus = "AUTHORIZED";
  });
  const markDispatched = vi.fn(async () => {
    if (options?.dispatchMarkerFailure) throw new Error("dispatch transition unavailable");
    durableStatus = "ISSUING";
  });

  const payment = {
    id: "movement-1",
    businessId: "business-1",
    total: 123,
    paidMethod: "efectivo",
    business: { name: "Local", ptoVenta: [7], condicionIva: "Responsable Inscripto" },
    order: {
      id: "order-1",
      businessId: "business-1",
      total: 500,
      date: new Date("2025-04-03T10:00:00.000Z"),
      client: {
        id: "client-1",
        name: "Cliente de la orden",
        ivaCondition: "Responsable Inscripto",
        fiscalDocumentType: "CUIT" as const,
        fiscalDocumentNumber: "20123456789",
      },
      // These values belong to the full order invoice and must remain separate.
      invoice: { cae: "ORDER-CAE-OLD", billType: "Factura C", invoiceNumber: 44 },
    },
  };

  const dependencies: PaymentVoucherDependencies = {
    auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-1" } }),
    repository: {
      findPayment: vi.fn().mockResolvedValue(payment),
      isAfipEligible: vi.fn().mockResolvedValue(true),
      claim: vi.fn(async () => {
        attemptNumber += durableStatus === "FAILED" ? 1 : 0;
        durableStatus = "PENDING";
        return { status: "PENDING", attempt: attemptNumber, acquired: true };
      }),
      markDispatched,
      persistAuthorized,
      persistFailure,
      getVoucher: vi.fn(async () => durableStatus === "MISSING" ? null : ({
        status: durableStatus,
        amount: 123,
        billType: "Factura B",
        currentAttempt: attemptNumber,
      })),
      transaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    },
    afip: {
      prepare: vi.fn(async () => {
        if (options?.prepareFailure) throw new Error("preflight rejected with private details");
        return { ok: true as const, capability: { opaque: true } };
      }),
      issue: vi.fn(async (_capability, onDispatch) => {
        await onDispatch?.();
        post();
        if (options?.remoteBehavior === "timeout") throw new Error("socket reset after POST");
        return authorizedRemoteResult;
      }),
      reconcile: reconcileRemote,
    },
  };

  return {
    service: createPaymentVoucherService(dependencies),
    dependencies,
    payment,
    post,
    reconcileRemote,
    persistFailure,
    persistAuthorized,
    markDispatched,
    getStatus: () => durableStatus,
  };
};

describe("recuperación segura de comprobantes de pagos parciales", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clasifica errores de validación/preparación previos al marcador como FAILED sin POST", async () => {
    const harness = createServiceHarness({ prepareFailure: true });

    const result = await harness.service.issue({
      cashMovementId: "movement-1",
      billType: "Factura B",
      ptoVenta: 7,
    });

    expect(result).toMatchObject({ paymentRecorded: true, voucherStatus: "FAILED" });
    expect(harness.post).not.toHaveBeenCalled();
    expect(harness.markDispatched).not.toHaveBeenCalled();
    expect(harness.persistFailure).toHaveBeenCalledWith(expect.objectContaining({
      status: "FAILED",
      safeErrorCode: "PREFLIGHT_REJECTED",
    }));
    expect(JSON.stringify(result)).not.toMatch(/private details|socket reset|stack/i);
  });

  it("si el marcador durable no se guarda, no despacha y conserva FAILED reintentable", async () => {
    const harness = createServiceHarness({ dispatchMarkerFailure: true });

    const result = await harness.service.issue({
      cashMovementId: "movement-1",
      billType: "Factura B",
      ptoVenta: 7,
    });

    expect(result).toMatchObject({ paymentRecorded: true, voucherStatus: "FAILED" });
    expect(harness.markDispatched).toHaveBeenCalledTimes(1);
    expect(harness.post).not.toHaveBeenCalled();
    expect(harness.getStatus()).toBe("FAILED");
  });

  it("clasifica timeout tras despacho como UNKNOWN y una repetición no emite un segundo POST", async () => {
    const harness = createServiceHarness({ remoteBehavior: "timeout" });
    const issueInput = { cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 7 };

    const first = await harness.service.issue(issueInput);
    const repeated = await harness.service.issue(issueInput);

    expect(first).toMatchObject({
      paymentRecorded: true,
      voucherStatus: "UNKNOWN",
      reconciliationRequired: true,
    });
    expect(repeated).toMatchObject({ voucherStatus: "UNKNOWN", reconciliationRequired: true });
    expect(harness.getStatus()).toBe("UNKNOWN");
    expect(harness.post).toHaveBeenCalledTimes(1);
    await expect(harness.service.print({ cashMovementId: "movement-1" })).rejects.toThrow(/no está autorizado/i);
  });

  it("si la autorización remota llegó pero falla su persistencia, bloquea impresión y todo segundo POST", async () => {
    const harness = createServiceHarness({ persistAuthorizationFailure: true });
    const issueInput = { cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 7 };

    const first = await harness.service.issue(issueInput);
    const replay = await harness.service.issue(issueInput);

    expect(first).toMatchObject({
      paymentRecorded: true,
      voucherStatus: "UNKNOWN",
      reconciliationRequired: true,
    });
    expect(harness.persistAuthorized).toHaveBeenCalledTimes(1);
    expect(harness.persistFailure).toHaveBeenCalledWith(expect.objectContaining({
      status: "UNKNOWN",
      safeErrorCode: "PERSISTENCE_FAILED",
    }));
    expect(replay).toMatchObject({ voucherStatus: "UNKNOWN" });
    expect(harness.post).toHaveBeenCalledTimes(1);
    await expect(harness.service.print({ cashMovementId: "movement-1" })).rejects.toThrow(/no está autorizado/i);
  });

  it("reconciliación unresolved no llama emisión, no autoriza impresión y conserva UNKNOWN", async () => {
    const harness = createServiceHarness({ initialStatus: "UNKNOWN" });

    const result = await harness.service.reconcile({ cashMovementId: "movement-1" });

    expect(result).toEqual({ status: "UNKNOWN", reconciliationRequired: true });
    expect(harness.reconcileRemote).toHaveBeenCalledTimes(1);
    expect(harness.post).not.toHaveBeenCalled();
    expect(harness.dependencies.afip.issue).not.toHaveBeenCalled();
    expect(harness.persistFailure).not.toHaveBeenCalled();
    expect(harness.getStatus()).toBe("UNKNOWN");
    await expect(harness.service.print({ cashMovementId: "movement-1" })).rejects.toThrow(/no está autorizado/i);
  });

  it.each(["AUTHORIZED", "NOT_REQUIRED", "PENDING", "ISSUING", "UNKNOWN"])(
    "no inicia POST desde un voucher terminal o con intento activo en estado %s, aun con retry solicitado",
    async (status) => {
      const harness = createServiceHarness({ initialStatus: status });

      const result = await harness.service.issue({
        cashMovementId: "movement-1",
        billType: "Factura B",
        ptoVenta: 7,
        retry: true,
      });

      expect(result).toMatchObject({ voucherStatus: status });
      expect(harness.post).not.toHaveBeenCalled();
      expect(harness.dependencies.repository.claim).not.toHaveBeenCalled();
    },
  );

  it("no convierte una señal aproximada de secuencia/importe/fecha en ausencia autorizada", async () => {
    const harness = createServiceHarness({ initialStatus: "UNKNOWN" });
    // Current gateway contract has no authoritative lookup; it must report unresolved.
    // A last-number/amount/date hint is deliberately not part of that contract.
    const approximateHint = { lastNumber: 902, amount: 123, issuedAt: new Date() };

    const result = await harness.service.reconcile({
      cashMovementId: "movement-1",
      ...approximateHint,
    } as { cashMovementId: string });

    expect(result).toEqual({ status: "UNKNOWN", reconciliationRequired: true });
    expect(harness.getStatus()).toBe("UNKNOWN");
    expect(harness.post).not.toHaveBeenCalled();
    expect(harness.persistFailure).not.toHaveBeenCalled();
  });

  it.each(["123", "123.0", "123.00"])(
    "acepta solo el valor decimal exacto equivalente al pago (%s)",
    async (total) => {
      const harness = createServiceHarness();
      const preparedResult = { ...authorizedRemoteResult, total };
      vi.mocked(harness.dependencies.afip.issue).mockImplementationOnce(async (_capability, onDispatch) => {
        await onDispatch?.();
        harness.post();
        return preparedResult;
      });

      const result = await harness.service.issue({
        cashMovementId: "movement-1",
        billType: "Factura B",
        ptoVenta: 7,
      });

      expect(result).toMatchObject({ voucherStatus: "AUTHORIZED" });
      expect(harness.getStatus()).toBe("AUTHORIZED");
    },
  );

  it.each(["123.4", "124", undefined, "not-a-number"])(
    "deja UNKNOWN, no imprimible ni reintentable cuando el total autorizado no coincide (%s)",
    async (total) => {
      const harness = createServiceHarness();
      vi.mocked(harness.dependencies.afip.issue).mockImplementationOnce(async (_capability, onDispatch) => {
        await onDispatch?.();
        harness.post();
        return total === undefined
          ? { kind: "unknown" as const }
          : { ...authorizedRemoteResult, total };
      });

      const result = await harness.service.issue({
        cashMovementId: "movement-1",
        billType: "Factura B",
        ptoVenta: 7,
      });
      const repeated = await harness.service.issue({
        cashMovementId: "movement-1",
        billType: "Factura B",
        ptoVenta: 7,
        retry: true,
      });

      expect(result).toMatchObject({ voucherStatus: "UNKNOWN", reconciliationRequired: true });
      expect(harness.getStatus()).toBe("UNKNOWN");
      expect(repeated).toMatchObject({ voucherStatus: "UNKNOWN" });
      expect(harness.post).toHaveBeenCalledTimes(1);
      await expect(harness.service.print({ cashMovementId: "movement-1" })).rejects.toThrow(/no está autorizado/i);
    },
  );

  it("no autoriza una respuesta de otro punto de venta y la deja UNKNOWN", async () => {
    const harness = createServiceHarness();
    vi.mocked(harness.dependencies.afip.issue).mockImplementationOnce(async (_capability, onDispatch) => {
      await onDispatch?.();
      harness.post();
      return { ...authorizedRemoteResult, pointOfSale: 8 };
    });

    const result = await harness.service.issue({
      cashMovementId: "movement-1",
      billType: "Factura B",
      ptoVenta: 7,
    });

    expect(result).toMatchObject({ voucherStatus: "UNKNOWN", reconciliationRequired: true });
    expect(harness.getStatus()).toBe("UNKNOWN");
    expect(harness.post).toHaveBeenCalledTimes(1);
    await expect(harness.service.print({ cashMovementId: "movement-1" })).rejects.toThrow(/no está autorizado/i);
  });

  it("permite un retry explícito después de FAILED y preserva el importe del movimiento", async () => {
    const harness = createServiceHarness({ initialStatus: "FAILED" });

    const result = await harness.service.issue({
      cashMovementId: "movement-1",
      billType: "Factura C",
      ptoVenta: 7,
      retry: true,
    });

    expect(result).toMatchObject({ voucherStatus: "AUTHORIZED" });
    expect(harness.dependencies.repository.claim).toHaveBeenCalledWith(expect.objectContaining({
      paymentId: "movement-1",
      amount: 123,
      billType: "Factura C",
      ptoVenta: 7,
    }));
    expect(harness.post).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.repository.persistAuthorized).toHaveBeenCalledWith(expect.objectContaining({
      paymentId: "movement-1",
      amount: 123,
      billType: "Factura C",
    }));
    expect(harness.payment.order.invoice).toEqual({ cae: "ORDER-CAE-OLD", billType: "Factura C", invoiceNumber: 44 });
  });

  it("el adaptador de gateway actualmente instalado mantiene UNKNOWN unresolved sin emitir", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.cashMovement.findFirst).mockResolvedValue({
      id: "movement-1",
      businessId: "business-1",
      total: 123,
      business: { name: "Local", ptoVenta: [7], condicionIva: "Responsable Inscripto" },
      order: { id: "order-1", businessId: "business-1" },
    } as never);
    vi.mocked(db.paymentVoucher.findFirst).mockResolvedValue({
      id: "voucher-1",
      status: "UNKNOWN",
      amount: { toString: () => "123" },
      billType: "Factura B",
      afipVoucherType: 6,
      invoiceNumber: null,
      invoicePointOfSale: 7,
      cae: null,
      caeVencimiento: null,
      qrData: null,
      issuedAt: null,
      fiscalSnapshot: null,
      currentAttempt: 1,
      attempts: [],
      updatedAt: new Date(),
    } as never);

    const result = await paymentVoucherService.reconcile({ cashMovementId: "movement-1" });

    expect(result).toEqual({ status: "UNKNOWN", reconciliationRequired: true });
    expect(db.cashMovement.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "movement-1", businessId: "business-1", order: { is: { businessId: "business-1" } } },
    }));
    expect(db.paymentVoucher.findFirst).toHaveBeenCalledTimes(1);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
