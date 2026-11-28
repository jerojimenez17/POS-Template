import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureConsoleCalls, expectSafeQrTelemetry } from "../afip-arca-qr-svg-display/qr-telemetry-test-helpers";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  createOrder: vi.fn(),
  findOrder: vi.fn(),
  updateOrder: vi.fn(),
  orderUpdateCreate: vi.fn(),
  after: vi.fn(),
  grantFindFirst: vi.fn(),
  grantUpdateMany: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn() } }));
vi.mock("@/lib/batch-utils", () => ({
  processInBatches: vi.fn(),
  bulkUpdateStock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/server/fiscal-snapshot-grant", () => ({
  consumeAuthorizedFiscalSnapshotGrant: vi.fn().mockResolvedValue(undefined),
}));

import { processSaleAction } from "@/actions/sales/process";
import { updateOrderCaeAction } from "@/actions/sales/update";

const AUTHORIZED_CAE = {
  CAE: "12345678901234",
  vencimiento: "20261231",
  nroComprobante: 345,
  ptoVenta: 12,
  qrAttestationToken: "opaque-token-synthetic-qr",
  qrData: "tampered-raw-from-browser",
  qrUrl: "https://attacker.invalid/qr?p=client-controlled",
  requestDate: "1999-01-01",
};

const VALID_QR_PAYLOAD = {
  ver: 1,
  fecha: "2026-04-09",
  cuit: 30712345678,
  ptoVta: 12,
  tipoCmp: 6,
  nroCmp: 345,
  importe: 2750,
  moneda: "PES",
  ctz: 1,
  tipoDocRec: 99,
  nroDocRec: 0,
  tipoCodAut: "E",
  codAut: 12345678901234,
};

function transactionClient() {
  return {
    cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "box-1" }) },
    order: {
      create: mocks.createOrder,
      findFirst: mocks.findOrder,
      update: mocks.updateOrder,
    },
    orderUpdate: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: mocks.orderUpdateCreate,
    },
    stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    authorizedArcaQrGrant: {
      findFirst: mocks.grantFindFirst,
      updateMany: mocks.grantUpdateMany,
    },
  };
}

const baseSale = {
  total: 2750,
  totalWithDiscount: 2750,
  seller: "Synthetic QA seller",
  paidMethod: "Tarjeta",
  products: [],
  clientIvaCondition: "Consumidor Final",
  clientDocumentType: "",
  clientDocumentNumber: "",
  billType: "Factura B",
  CAE: AUTHORIZED_CAE,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1", businessId: "tenant-qr-test-a", role: "ADMIN" } });
  mocks.after.mockImplementation(() => undefined);
  mocks.createOrder.mockResolvedValue({ id: "saved-order-qr-1" });
  mocks.findOrder.mockResolvedValue({ total: 2750, fiscalSnapshot: null });
  mocks.updateOrder.mockResolvedValue({ id: "saved-order-qr-1" });
  mocks.orderUpdateCreate.mockResolvedValue({ id: "order-update-1" });
  mocks.grantFindFirst.mockResolvedValue(null);
  mocks.grantUpdateMany.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (callback: (tx: ReturnType<typeof transactionClient>) => Promise<unknown>) =>
    callback(transactionClient()));
});

describe("new standard CAE persistence must not trust QR fields from the browser", () => {
  it("persists the grant reference after matching all server-bound claims", async () => {
    mocks.grantFindFirst.mockResolvedValue({
      id: "grant-bound-to-this-cae",
      businessId: "tenant-qr-test-a",
      cae: AUTHORIZED_CAE.CAE,
      billType: "Factura B",
      afipVoucherType: 6,
      invoiceNumber: 345,
      pointOfSale: 12,
      fiscalAmount: "2750.00",
      issuerCuit: "30712345678",
      requestDate: "2026-04-09",
      recipientIvaCondition: "Consumidor Final",
      recipientDocumentType: null,
      recipientDocumentNumber: null,
      payload: VALID_QR_PAYLOAD,
      rawQrData: "trusted-grant-raw",
    });
    mocks.grantUpdateMany.mockResolvedValue({ count: 1 });

    await processSaleAction({ ...baseSale } as never);
    const persisted = mocks.createOrder.mock.calls[0]?.[0]?.data as Record<string, unknown> | undefined;
    const persistedCae = persisted?.CAE as Record<string, unknown> | undefined;

    expect(mocks.grantFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "tenant-qr-test-a",
        cae: AUTHORIZED_CAE.CAE,
        billType: "Factura B",
        afipVoucherType: 6,
        invoiceNumber: 345,
        pointOfSale: 12,
        fiscalAmount: "2750.00",
        recipientIvaCondition: "Consumidor Final",
        recipientDocumentType: null,
        recipientDocumentNumber: null,
      }),
    }));
    expect(mocks.grantUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.grantUpdateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ id: "grant-bound-to-this-cae", consumedAt: null }),
      data: expect.objectContaining({ consumedAt: expect.any(Date) }),
    }));
    expect(mocks.grantUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "grant-bound-to-this-cae", orderId: null },
      data: { orderId: "saved-order-qr-1" },
    });
    expect(persistedCae?.qrAttestationId).toBe("grant-bound-to-this-cae");
    expect(persistedCae?.qrData).not.toBe(AUTHORIZED_CAE.qrData);
    expect(persistedCae?.qrUrl).not.toBe(AUTHORIZED_CAE.qrUrl);
    expect(persistedCae?.requestDate).not.toBe(AUTHORIZED_CAE.requestDate);
    expect(persisted?.qrDataPolicyVersion).toBe(1);
  });

  it.each([
    ["altered token", { ...AUTHORIZED_CAE, qrAttestationToken: "changed-token" }],
    ["missing token", { ...AUTHORIZED_CAE, qrAttestationToken: undefined }],
    ["replayed token", { ...AUTHORIZED_CAE, qrAttestationToken: "replayed-token" }],
  ])("keeps the CAE saveable and omits all QR claims for a %s", async (_label, cae) => {
    const telemetry = captureConsoleCalls();

    try {
      const result = await processSaleAction({ ...baseSale, CAE: cae } as never);
      const persisted = mocks.createOrder.mock.calls[0]?.[0]?.data as Record<string, unknown> | undefined;

      expect(result).toMatchObject({ success: true, orderId: "saved-order-qr-1" });
      expect(persisted?.CAE).toMatchObject({ CAE: AUTHORIZED_CAE.CAE, nroComprobante: 345 });
      expect(persisted?.CAE).not.toHaveProperty("qrData");
      expect(persisted?.CAE).not.toHaveProperty("qrUrl");
      expect(persisted?.CAE).not.toHaveProperty("requestDate");
      expect(persisted?.CAE).not.toHaveProperty("qrAttestationToken");
      expect(persisted?.qrDataPolicyVersion).toBe(1);
      expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
      expectSafeQrTelemetry(telemetry.calls, {
        stage: "save-consume-ref",
        reason: _label === "missing token" ? "token-absent" : "binding-mismatch",
      }, [
        "saved-order-qr-1",
        "tenant-qr-test-a",
        "12345678901234",
        "30712345678",
        "30123456",
        "opaque-token-synthetic-qr",
        "changed-token",
        "replayed-token",
        "tampered-raw-from-browser",
        "attacker.invalid",
        "2750",
      ]);
    } finally {
      telemetry.restore();
    }
  });

  it("returns only the saved order identity for the immediate post-save print lookup", async () => {
    const result = await processSaleAction({ ...baseSale } as never);

    expect(result).toEqual({ success: true, orderId: "saved-order-qr-1" });
    expect(JSON.stringify(result)).not.toContain("tampered-raw-from-browser");
    expect(JSON.stringify(result)).not.toContain("attacker.invalid");
    expect(JSON.stringify(result)).not.toContain("opaque-token-synthetic-qr");
  });
});

describe("CAE update must not persist client-injected QR values", () => {
  it("consumes an update grant only for the tenant and invoice binding being saved", async () => {
    mocks.grantFindFirst.mockResolvedValue({
      id: "grant-update-bound",
      businessId: "tenant-qr-test-a",
      cae: AUTHORIZED_CAE.CAE,
      billType: "Factura B",
      afipVoucherType: 6,
      invoiceNumber: 345,
      pointOfSale: 12,
      fiscalAmount: "2750.00",
      issuerCuit: "30712345678",
      requestDate: "2026-04-09",
      recipientIvaCondition: "Consumidor Final",
      recipientDocumentType: null,
      recipientDocumentNumber: null,
      payload: VALID_QR_PAYLOAD,
      rawQrData: "trusted-grant-update-raw",
    });
    mocks.grantUpdateMany.mockResolvedValue({ count: 1 });

    await updateOrderCaeAction("saved-order-qr-1", {
      CAE: AUTHORIZED_CAE,
      IVACondition: "Consumidor Final",
      documentType: "",
      documentNumber: "",
      paidMethod: "Tarjeta",
      billType: "Factura B",
    } as never);

    expect(mocks.grantFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "tenant-qr-test-a",
        cae: AUTHORIZED_CAE.CAE,
        billType: "Factura B",
        afipVoucherType: 6,
        invoiceNumber: 345,
        pointOfSale: 12,
        fiscalAmount: "2750.00",
        recipientIvaCondition: "Consumidor Final",
        recipientDocumentType: null,
        recipientDocumentNumber: null,
      }),
    }));
    expect(mocks.grantUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.grantUpdateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ id: "grant-update-bound", consumedAt: null }),
      data: expect.objectContaining({ consumedAt: expect.any(Date) }),
    }));
    expect(mocks.grantUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "grant-update-bound", orderId: null },
      data: { orderId: "saved-order-qr-1" },
    });
    const persisted = mocks.updateOrder.mock.calls[0]?.[0]?.data as Record<string, unknown> | undefined;
    expect(persisted?.CAE).toHaveProperty("qrAttestationId", "grant-update-bound");
    expect(persisted?.CAE).not.toHaveProperty("qrUrl", AUTHORIZED_CAE.qrUrl);
    expect(persisted?.qrDataPolicyVersion).toBe(1);
  });

  it.each([
    ["invalid token", { ...AUTHORIZED_CAE, qrAttestationToken: "invalid-token" }],
    ["missing token", { ...AUTHORIZED_CAE, qrAttestationToken: undefined }],
    ["replayed token", { ...AUTHORIZED_CAE, qrAttestationToken: "replayed-token" }],
  ])("saves CAE but omits QR claims with a %s", async (_label, cae) => {
    const result = await updateOrderCaeAction("saved-order-qr-1", {
      CAE: cae,
      IVACondition: "Consumidor Final",
      documentType: "",
      documentNumber: "",
      paidMethod: "Tarjeta",
      billType: "Factura B",
    } as never);
    const persisted = mocks.updateOrder.mock.calls[0]?.[0]?.data as Record<string, unknown> | undefined;

    expect(result).toMatchObject({ success: true });
    expect(persisted?.CAE).toMatchObject({ CAE: AUTHORIZED_CAE.CAE, nroComprobante: 345 });
    expect(persisted?.CAE).not.toHaveProperty("qrData");
    expect(persisted?.CAE).not.toHaveProperty("qrUrl");
    expect(persisted?.CAE).not.toHaveProperty("requestDate");
    expect(persisted?.CAE).not.toHaveProperty("qrAttestationToken");
    expect(persisted?.qrDataPolicyVersion).toBe(1);
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });
});
