import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  createOrder: vi.fn(),
  updateOrder: vi.fn(),
  findOrder: vi.fn(),
  consumeGrant: vi.fn(),
  getIssuerCuit: vi.fn(),
  telemetry: vi.fn(),
  inTransactionCallback: false,
  referenceEventCallbackStates: [] as boolean[],
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/server/authorized-arca-qr-grant", () => ({
  consumeAuthorizedArcaQrGrant: mocks.consumeGrant,
  getTenantIssuerCuit: mocks.getIssuerCuit,
}));
vi.mock("@/lib/server/qr-telemetry", () => ({ logQrTelemetry: mocks.telemetry }));
vi.mock("@/lib/server/fiscal-snapshot-grant", () => ({ consumeAuthorizedFiscalSnapshotGrant: vi.fn() }));
vi.mock("@/lib/batch-utils", () => ({
  processInBatches: vi.fn(),
  bulkUpdateStock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) } }));

import { processSaleAction } from "@/actions/sales/process";
import { updateOrderCaeAction } from "@/actions/sales/update";

type Tx = {
  cashboxSession: { findFirst: ReturnType<typeof vi.fn> };
  order: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  stockMovement: { createMany: ReturnType<typeof vi.fn> };
};

function transactionClient(): Tx {
  return {
    cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "synthetic-session", cashboxId: "synthetic-box" }) },
    order: {
      create: mocks.createOrder,
      findFirst: mocks.findOrder,
      update: mocks.updateOrder,
    },
    stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

function configureTransaction(commitFails = false) {
  mocks.transaction.mockImplementation(async (callback: (tx: Tx) => Promise<unknown>) => {
    mocks.inTransactionCallback = true;
    const callbackResult = await callback(transactionClient());
    mocks.inTransactionCallback = false;
    if (commitFails) throw new Error("synthetic commit failure");
    return callbackResult;
  });
}

async function invokeSaveAction(action: "process" | "update") {
  if (action === "process") {
    return processSaleAction({
      total: 125,
      seller: "Synthetic seller",
      paidMethod: "Tarjeta",
      products: [],
      billType: "Factura B",
      CAE: {
        CAE: "CAE-SYNTHETIC-PRIVATE",
        vencimiento: "20261231",
        nroComprobante: 45,
        ptoVenta: 3,
        qrAttestationToken: "TOKEN-SYNTHETIC-PRIVATE",
      },
    });
  }

  return updateOrderCaeAction("ORDER-SYNTHETIC-PRIVATE", {
    CAE: {
      CAE: "CAE-SYNTHETIC-PRIVATE",
      vencimiento: "20261231",
      nroComprobante: 45,
      ptoVenta: 3,
      qrAttestationToken: "TOKEN-SYNTHETIC-PRIVATE",
    },
    IVACondition: "Consumidor Final",
    paidMethod: "Tarjeta",
    billType: "Factura B",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inTransactionCallback = false;
  mocks.referenceEventCallbackStates = [];
  mocks.auth.mockResolvedValue({ user: { id: "synthetic-user", businessId: "TENANT-SYNTHETIC-PRIVATE" } });
  mocks.createOrder.mockResolvedValue({ id: "ORDER-SYNTHETIC-PRIVATE" });
  mocks.findOrder.mockResolvedValue({ total: 125, fiscalSnapshot: null });
  mocks.updateOrder.mockResolvedValue({ id: "ORDER-SYNTHETIC-PRIVATE" });
  mocks.getIssuerCuit.mockResolvedValue("CUIT-SYNTHETIC-PRIVATE");
  mocks.consumeGrant.mockResolvedValue({ id: "GRANT-SYNTHETIC-PRIVATE" });
  configureTransaction();
});

describe("reference-persisted telemetry reflects transaction commit", () => {
  it.each(["process", "update"] as const)(
    "%s does not report a persisted reference when the callback completed but commit rejects",
    async (action) => {
      configureTransaction(true);
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

      try {
        await invokeSaveAction(action);

        expect(mocks.telemetry).not.toHaveBeenCalledWith(
          expect.objectContaining({ stage: "save-consume-ref", outcome: "reference-persisted" }),
        );
      } finally {
        error.mockRestore();
      }
    },
  );

  it.each(["process", "update"] as const)(
    "%s reports reference-persisted only after the transaction promise resolves",
    async (action) => {
      mocks.telemetry.mockImplementation((event: { outcome?: string }) => {
        if (event.outcome === "reference-persisted") mocks.referenceEventCallbackStates.push(mocks.inTransactionCallback);
      });

      await invokeSaveAction(action);

      expect(mocks.telemetry).toHaveBeenCalledWith(
        expect.objectContaining({ stage: "save-consume-ref", outcome: "reference-persisted" }),
      );
      expect(mocks.referenceEventCallbackStates).toEqual([false]);
    },
  );
});
