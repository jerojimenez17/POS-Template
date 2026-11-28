import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  createOrder: vi.fn(),
  findOrder: vi.fn(),
  updateOrder: vi.fn(),
  grantLinkCas: vi.fn(),
  consumeGrant: vi.fn(),
  inTransaction: false,
  operations: [] as string[],
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/server/authorized-arca-qr-grant", () => ({
  consumeAuthorizedArcaQrGrant: mocks.consumeGrant,
  getTenantIssuerCuit: vi.fn().mockResolvedValue("30712345678"),
}));
vi.mock("@/lib/server/fiscal-snapshot-grant", () => ({ consumeAuthorizedFiscalSnapshotGrant: vi.fn() }));
vi.mock("@/lib/server/qr-telemetry", () => ({ logQrTelemetry: vi.fn() }));
vi.mock("@/lib/batch-utils", () => ({
  processInBatches: vi.fn(),
  bulkUpdateStock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn() } }));

import { processSaleAction } from "@/actions/sales/process";
import { updateOrderCaeAction } from "@/actions/sales/update";

const SALE_CAE = {
  CAE: "12345678901234",
  vencimiento: "20261231",
  nroComprobante: 345,
  ptoVenta: 12,
  qrAttestationToken: "synthetic-opaque-token",
};

function txClient() {
  return {
    cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "session", cashboxId: "box" }) },
    order: {
      create: async (args: { data: Record<string, unknown> }) => {
        mocks.operations.push("create-order");
        return mocks.createOrder(args);
      },
      findFirst: mocks.findOrder,
      update: async (args: { data: Record<string, unknown> }) => {
        mocks.operations.push("update-order");
        return mocks.updateOrder(args);
      },
    },
    orderUpdate: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "edit" }) },
    stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    authorizedArcaQrGrant: {
      updateMany: async (args: unknown) => {
        mocks.operations.push("link-grant");
        return mocks.grantLinkCas(args);
      },
    },
  };
}

function configureTransaction() {
  mocks.transaction.mockImplementation(async (callback: (tx: ReturnType<typeof txClient>) => Promise<unknown>) => {
    mocks.inTransaction = true;
    try {
      return await callback(txClient());
    } finally {
      mocks.inTransaction = false;
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inTransaction = false;
  mocks.operations = [];
  mocks.auth.mockResolvedValue({ user: { id: "qa-user", businessId: "qa-tenant", role: "ADMIN" } });
  mocks.createOrder.mockResolvedValue({ id: "new-sale-order" });
  mocks.findOrder.mockResolvedValue({ total: 2750, fiscalSnapshot: null, items: [] });
  mocks.updateOrder.mockResolvedValue({ id: "existing-sale-order" });
  mocks.grantLinkCas.mockImplementation(async (args: unknown) => {
    expect(mocks.inTransaction).toBe(true);
    return { count: 1, args };
  });
  mocks.consumeGrant.mockResolvedValue({ id: "consumed-grant", claims: {} });
  configureTransaction();
});

describe("sale transaction associates the consumed QR grant to its order", () => {
  it("creates a sale, CAS-links grant.orderId, and stores CAE.qrAttestationId in the same transaction", async () => {
    const result = await processSaleAction({
      total: 2750,
      seller: "Synthetic seller",
      paidMethod: "Tarjeta",
      products: [],
      clientIvaCondition: "Consumidor Final",
      billType: "Factura B",
      CAE: SALE_CAE,
    });

    const createData = mocks.createOrder.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(result).toEqual({ success: true, orderId: "new-sale-order" });
    expect((createData.CAE as Record<string, unknown>).qrAttestationId).toBe("consumed-grant");
    expect(createData.qrDataPolicyVersion).toBe(1);
    expect(mocks.grantLinkCas).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "consumed-grant", orderId: null }),
      data: expect.objectContaining({ orderId: "new-sale-order" }),
    }));
    expect(mocks.operations.indexOf("create-order")).toBeLessThan(mocks.operations.indexOf("link-grant"));
  });

  it("links a grant to an existing order while updating CAE within the interactive transaction", async () => {
    const result = await updateOrderCaeAction("existing-sale-order", {
      CAE: SALE_CAE,
      IVACondition: "Consumidor Final",
      documentType: "",
      documentNumber: "",
      paidMethod: "Tarjeta",
      billType: "Factura B",
    } as never);

    const updateData = mocks.updateOrder.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(result).toMatchObject({ success: true });
    expect((updateData.CAE as Record<string, unknown>).qrAttestationId).toBe("consumed-grant");
    expect(updateData.qrDataPolicyVersion).toBe(1);
    expect(mocks.grantLinkCas).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "consumed-grant", orderId: null }),
      data: expect.objectContaining({ orderId: "existing-sale-order" }),
    }));
    expect(mocks.operations).toContain("update-order");
    expect(mocks.operations).toContain("link-grant");
  });
});
