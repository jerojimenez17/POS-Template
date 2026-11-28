import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  createOrder: vi.fn(),
  findOrder: vi.fn(),
  findGrant: vi.fn(),
  updateGrant: vi.fn(),
  after: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    order: { findFirst: mocks.findOrder },
    authorizedArcaQrGrant: { findFirst: mocks.findGrant, findUnique: mocks.findGrant },
  },
}));
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
import { resolveOrderQrPrintDto } from "@/lib/server/authorized-arca-qr-grant";
import { resolveOrderQrPrintDtoAction } from "@/actions/sales/qr-print";
import { captureConsoleCalls, expectSafeQrTelemetry } from "./qr-telemetry-test-helpers";

function transactionClient() {
  return {
    cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "session-qr", cashboxId: "box-qr" }) },
    order: { create: mocks.createOrder, findFirst: mocks.findOrder, update: vi.fn() },
    orderUpdate: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    authorizedArcaQrGrant: { findFirst: mocks.findGrant, updateMany: mocks.updateGrant },
    stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "qr-user", businessId: "qr-tenant", role: "ADMIN" } });
  mocks.after.mockImplementation(() => undefined);
  mocks.createOrder.mockResolvedValue({ id: "saved-qr-invoice" });
  mocks.findOrder.mockImplementation(async () => {
    const saved = mocks.createOrder.mock.calls[0]?.[0]?.data as Record<string, unknown> | undefined;
    return saved ? { id: "saved-qr-invoice", ...saved } : null;
  });
  mocks.findGrant.mockResolvedValue(null);
  mocks.updateGrant.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (callback: (tx: ReturnType<typeof transactionClient>) => Promise<unknown>) =>
    callback(transactionClient()));
});

describe("missing QR proof handoff remains fail-open for the authorized invoice", () => {
  it("saves CAE with policy 1, strips browser QR claims, then resolves none for that saved tenant order", async () => {
    const telemetry = captureConsoleCalls();

    try {
      const result = await processSaleAction({
        total: 2750,
        totalWithDiscount: 2750,
        seller: "Synthetic QA seller",
        paidMethod: "Tarjeta",
        products: [],
        clientIvaCondition: "Consumidor Final",
        clientDocumentType: "",
        clientDocumentNumber: "",
        billType: "Factura B",
        CAE: {
          CAE: "12345678901234",
          vencimiento: "20261231",
          nroComprobante: 345,
          qrData: "untrusted-browser-raw",
          qrUrl: "https://untrusted.invalid/qr?p=forged",
          requestDate: "1999-01-01",
        },
      } as never);

      expect(result).toEqual({ success: true, orderId: "saved-qr-invoice" });
      const saved = mocks.createOrder.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(saved.qrDataPolicyVersion).toBe(1);
      expect(saved.CAE).toMatchObject({ CAE: "12345678901234", nroComprobante: 345 });
      expect(saved.CAE).not.toHaveProperty("qrData");
      expect(saved.CAE).not.toHaveProperty("qrUrl");
      expect(saved.CAE).not.toHaveProperty("requestDate");
      expect(saved.CAE).not.toHaveProperty("qrAttestationId");
      expect(mocks.updateGrant).not.toHaveBeenCalled();

      await expect(resolveOrderQrPrintDto("saved-qr-invoice"))
        .resolves.toEqual({ qrValue: null, qrKind: "none" });
      // A successful Action invocation can resolve qrKind=none; the allowlisted
      // reason remains internal telemetry, independent of transport status.
      const actionDto = await resolveOrderQrPrintDtoAction("saved-qr-invoice");
      expect(actionDto).toEqual({ qrValue: null, qrKind: "none" });
      expect(actionDto).not.toHaveProperty("reason");
      expect(actionDto).not.toHaveProperty("stage");
      expect(mocks.findOrder).toHaveBeenLastCalledWith({
        where: { id: "saved-qr-invoice", businessId: "qr-tenant" },
      });
      expect(mocks.findGrant).not.toHaveBeenCalled();
      expectSafeQrTelemetry(telemetry.calls, {
        stage: "save-consume-ref",
        reason: "token-absent",
      }, ["saved-qr-invoice", "qr-tenant", "12345678901234", "2750", "untrusted-browser-raw", "untrusted.invalid"]);
      expectSafeQrTelemetry(telemetry.calls, {
        stage: "resolve",
        reason: "policy-v1-no-ref",
        qrKind: "none",
      }, ["saved-qr-invoice", "qr-tenant", "12345678901234", "2750", "untrusted-browser-raw", "untrusted.invalid"]);
    } finally {
      telemetry.restore();
    }
  });
});
