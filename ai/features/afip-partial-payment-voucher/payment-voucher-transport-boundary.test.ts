import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  axiosPostMock,
  requireFeatureMock,
  credentialsMock,
  voucherNumberMock,
  persistedBusinessFindUniqueMock,
} = vi.hoisted(() => ({
  axiosPostMock: vi.fn(),
  requireFeatureMock: vi.fn(),
  credentialsMock: vi.fn(),
  voucherNumberMock: vi.fn(),
  persistedBusinessFindUniqueMock: vi.fn(),
}));

vi.mock("axios", () => ({
  default: { post: axiosPostMock, isAxiosError: () => false },
}));
vi.mock("@/lib/auth-gates", () => ({ requireFeature: requireFeatureMock }));
vi.mock("@/lib/db", () => ({ db: { business: { findUnique: persistedBusinessFindUniqueMock } } }));
vi.mock("@/lib/server/arca-billing", () => ({
  getArcaCredentialsForBilling: credentialsMock,
  getVoucherNumberForActor: voucherNumberMock,
}));

import {
  issuePreparedAfipVoucher,
  prepareAfipVoucherForActor,
} from "@/lib/server/afip-voucher";
import { createPaymentVoucherService } from "@/lib/server/payment-voucher";
import type { PaymentVoucherDependencies, PaymentVoucherPayment } from "@/lib/server/payment-voucher";
import type BillState from "@/models/BillState";

const actor = { id: "qa-actor", role: "ADMIN", businessId: "qa-business", business: null };
const readyGate = { success: true, data: actor };

function invoice(overrides: Record<string, unknown> = {}): BillState {
  return {
    id: "movement-transport-test",
    seller: "QA",
    typeDocument: "FACTURA",
    IVACondition: "Consumidor Final",
    twoMethods: false,
    billType: "Factura B",
    paidMethod: "Efectivo",
    clientId: "client-1",
    client: "Cliente QA",
    clientIvaCondition: "Consumidor Final",
    clientDocumentType: null,
    clientDocumentNumber: null,
    discount: 0,
    documentNumber: 0,
    total: 123,
    totalWithDiscount: 123,
    date: new Date("2026-11-01T12:00:00.000Z"),
    ptoVenta: 3,
    products: [{ id: "movement-transport-test", code: "", description: "Pago parcial", price: 123, salePrice: 123, amount: 1 }],
    ...overrides,
  } as unknown as BillState;
}

function payment(): PaymentVoucherPayment {
  return {
    id: "movement-transport-test",
    businessId: "qa-business",
    total: 123,
    paidMethod: "Efectivo",
    business: { ptoVenta: [3] },
    order: {
      id: "order-1",
      businessId: "qa-business",
      total: 123,
      client: { id: "client-1", name: "Cliente QA", ivaCondition: "Consumidor Final" },
    },
  };
}

function configureAfipMocks(): void {
  vi.clearAllMocks();
  vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-access-token");
  vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-key");
  vi.stubEnv("NEXT_PUBLIC_AFIP_FUNCTION_URL", "https://afip.example.test/create-voucher");
  requireFeatureMock.mockResolvedValue(readyGate);
  credentialsMock.mockResolvedValue({
    success: { cuit: "20123456789", cert: "encrypted-cert", key: "encrypted-key", ptoVentas: [3] },
  });
  voucherNumberMock.mockResolvedValue({ success: 76 });
  persistedBusinessFindUniqueMock.mockResolvedValue({
    id: "qa-business",
    features: { hasAfipBilling: true },
  });
  axiosPostMock.mockResolvedValue({
    status: 200,
    data: { success: true, data: { CAE: "98765432101234", nroCbte: 77, ptoVenta: 3 } },
  });
}

function makeHarness(options: { failDispatchMarker?: boolean } = {}) {
  const events: string[] = [];
  const state: { voucherStatus: string | null; attempt: number; dispatchMarkers: number } = {
    voucherStatus: null,
    attempt: 0,
    dispatchMarkers: 0,
  };
  const repository: PaymentVoucherDependencies["repository"] = {
    findPayment: vi.fn().mockResolvedValue(payment()),
    isAfipEligible: vi.fn().mockResolvedValue(true),
    claim: vi.fn().mockImplementation(async () => {
      state.attempt += 1;
      state.voucherStatus = "PENDING";
      return { status: "PENDING", attempt: state.attempt, acquired: true };
    }),
    markDispatched: vi.fn().mockImplementation(async () => {
      events.push("dispatch-marker");
      if (options.failDispatchMarker) throw new Error("marker persistence unavailable");
      state.dispatchMarkers += 1;
      state.voucherStatus = "ISSUING";
    }),
    persistAuthorized: vi.fn().mockImplementation(async () => { state.voucherStatus = "AUTHORIZED"; }),
    persistFailure: vi.fn().mockImplementation(async (input: Record<string, unknown>) => {
      state.voucherStatus = String(input.status);
    }),
    getVoucher: vi.fn().mockImplementation(async () => state.voucherStatus ? { status: state.voucherStatus } : null),
    transaction: vi.fn(async <T>(callback: () => Promise<T>) => callback()) as unknown as PaymentVoucherDependencies["repository"]["transaction"],
  };

  const dependencies = {
    auth: vi.fn().mockResolvedValue({ user: { id: actor.id, businessId: actor.businessId, role: actor.role } }),
    repository,
    afip: {
      prepare: vi.fn(async (bill: Record<string, unknown>) => {
        const prepared = await prepareAfipVoucherForActor(bill as unknown as BillState, actor as never);
        return "prepared" in prepared
          ? { ok: true as const, capability: prepared.prepared }
          : { ok: false as const, definite: true as const };
      }),
      issue: vi.fn(async (capability: unknown, onDispatch?: () => Promise<void>) => {
        const result = await (issuePreparedAfipVoucher as unknown as (
          prepared: unknown,
          markDispatched?: () => Promise<void>,
        ) => Promise<Record<string, unknown>>)(capability, onDispatch);
        if (result.success === true && typeof result.data === "object" && result.data !== null) {
          const data = result.data as Record<string, unknown>;
          return {
            kind: "authorized" as const,
            total: 123,
            cae: String(data.cae),
            invoiceNumber: Number(data.nroComprobante),
            pointOfSale: Number(data.ptoVenta),
            issuedAt: new Date("2026-11-01T12:00:00.000Z"),
          };
        }
        if (result.issuanceNotStarted === true || (typeof result.diagnostic === "object"
          && result.diagnostic !== null
          && (result.diagnostic as Record<string, unknown>).authoritativeRejection === true)) {
          return { kind: "rejected" as const };
        }
        return { kind: "unknown" as const };
      }),
      reconcile: vi.fn().mockResolvedValue({ kind: "unresolved" as const }),
    },
  };
  const service = createPaymentVoucherService(dependencies as unknown as PaymentVoucherDependencies);
  return { service, repository, events, state };
}

describe("payment-voucher transport-boundary classification", () => {
  beforeEach(configureAfipMocks);
  afterEach(() => vi.unstubAllEnvs());

  it("preserves authorized PtoVta and CbteDesde instead of substituting the sequence preview", async () => {
    credentialsMock.mockResolvedValue({
      success: { cuit: "20123456789", cert: "encrypted-cert", key: "encrypted-key", ptoVentas: [7] },
    });
    voucherNumberMock.mockResolvedValue({ success: 1 });
    axiosPostMock.mockResolvedValue({
      status: 200,
      data: { success: true, data: { CAE: "98765432101234", nroCbte: 42, ptoVenta: 7 } },
    });

    const prepared = await prepareAfipVoucherForActor(invoice({ ptoVenta: 7 }), actor as never);
    expect(prepared).toHaveProperty("success", true);
    if (!("prepared" in prepared)) throw new Error("Expected a valid prepared AFIP request");

    const authorization = await (issuePreparedAfipVoucher as unknown as (
      preparedRequest: unknown,
    ) => Promise<Record<string, unknown>>)(prepared.prepared);
    const authorizationData = authorization.data as Record<string, unknown>;

    expect(authorizationData).toMatchObject({ nroComprobante: 42, ptoVenta: 7 });
    expect(authorizationData).not.toMatchObject({ nroComprobante: 1, ptoVenta: 1 });
    expect(axiosPostMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ arca: expect.objectContaining({ puntoVenta: 7 }) }),
      expect.any(Object),
    );
  });

  it("classifies a deterministic adapter failure before axios.post as FAILED without a dispatch marker", async () => {
    const { service, repository, state } = makeHarness();
    // Preparation succeeds; the final adapter's deterministic eligibility check throws before transport.
    requireFeatureMock.mockResolvedValueOnce(readyGate).mockRejectedValueOnce(new Error("pre-POST validation failed"));

    let thrown: unknown;
    let result: Record<string, unknown> | undefined;
    try {
      result = await service.issue({
        cashMovementId: "movement-transport-test",
        billType: "Factura B",
        ptoVenta: 3,
      });
    } catch (error: unknown) {
      thrown = error;
    }

    const classification = thrown && typeof thrown === "object" && "voucherStatus" in thrown
      ? (thrown as { voucherStatus: unknown }).voucherStatus
      : result?.voucherStatus;
    const persistedFailureStatus = state.voucherStatus;
    expect.soft(classification).toBe("FAILED");
    expect.soft(repository.markDispatched).not.toHaveBeenCalled();
    expect.soft(state.dispatchMarkers).toBe(0);
    expect.soft(repository.persistFailure).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILED" }));
    expect.soft(axiosPostMock).not.toHaveBeenCalled();

    if (persistedFailureStatus === "FAILED") {
      const retryResult = await service.issue({
        cashMovementId: "movement-transport-test",
        billType: "Factura B",
        ptoVenta: 3,
        retry: true,
      });
      expect.soft(retryResult).toMatchObject({ voucherStatus: "AUTHORIZED" });
      expect.soft(repository.claim).toHaveBeenCalledTimes(2);
      expect.soft(axiosPostMock).toHaveBeenCalledTimes(1);
    }
  });

  it("uses a durable callback immediately before axios.post; a POST exception becomes UNKNOWN and blocks retry", async () => {
    const { service, repository, events, state } = makeHarness();
    axiosPostMock.mockImplementation(async () => {
      events.push("axios.post");
      throw new Error("socket reset after dispatch");
    });

    const firstResult = await service.issue({
      cashMovementId: "movement-transport-test",
      billType: "Factura B",
      ptoVenta: 3,
    });

    expect(events).toEqual(["dispatch-marker", "axios.post"]);
    expect(state.dispatchMarkers).toBe(1);
    expect(firstResult).toMatchObject({ voucherStatus: "UNKNOWN", reconciliationRequired: true });
    expect(repository.persistFailure).toHaveBeenCalledWith(expect.objectContaining({ status: "UNKNOWN" }));

    const callCountAfterDispatch = axiosPostMock.mock.calls.length;
    const retryResult = await service.issue({
      cashMovementId: "movement-transport-test",
      billType: "Factura B",
      ptoVenta: 3,
      retry: true,
    });

    expect(retryResult).toMatchObject({ voucherStatus: "UNKNOWN", reconciliationRequired: true });
    expect(axiosPostMock).toHaveBeenCalledTimes(callCountAfterDispatch);
    expect(repository.claim).toHaveBeenCalledTimes(1);
  });

  it("does not invoke axios.post when durable dispatch-marker persistence fails", async () => {
    const { service, repository, state } = makeHarness({ failDispatchMarker: true });

    const result = await service.issue({
      cashMovementId: "movement-transport-test",
      billType: "Factura B",
      ptoVenta: 3,
    });

    expect(result).toMatchObject({ voucherStatus: "FAILED" });
    expect(repository.markDispatched).toHaveBeenCalledTimes(1);
    expect(state.dispatchMarkers).toBe(0);
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it("calls the adapter dispatch callback as the final operation before axios.post", async () => {
    const prepared = await prepareAfipVoucherForActor(invoice(), actor as never);
    expect(prepared).toHaveProperty("success", true);
    if (!("prepared" in prepared)) throw new Error("Expected a valid prepared AFIP request");

    const events: string[] = [];
    const dispatchCallback = vi.fn(async () => { events.push("dispatch-marker"); });
    axiosPostMock.mockImplementation(async () => {
      events.push("axios.post");
      return {
        status: 200,
        data: { success: true, data: { CAE: "98765432101234", nroCbte: 77, ptoVenta: 3 } },
      };
    });

    await (issuePreparedAfipVoucher as unknown as (
      preparedRequest: unknown,
      onDispatch: () => Promise<void>,
    ) => Promise<unknown>)(prepared.prepared, dispatchCallback);

    expect(events).toEqual(["dispatch-marker", "axios.post"]);
    expect(dispatchCallback).toHaveBeenCalledTimes(1);
  });
});
