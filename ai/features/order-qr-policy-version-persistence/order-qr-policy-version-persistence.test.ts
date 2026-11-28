import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  createOrder: vi.fn(),
  after: vi.fn(),
  bulkUpdateStock: vi.fn(),
  consumeFiscalSnapshotGrant: vi.fn(),
  consumeQrGrant: vi.fn(),
  getTenantIssuerCuit: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn() } }));
vi.mock("@/lib/batch-utils", () => ({
  processInBatches: vi.fn(),
  bulkUpdateStock: mocks.bulkUpdateStock,
}));
vi.mock("@/lib/server/fiscal-snapshot-grant", () => ({
  consumeAuthorizedFiscalSnapshotGrant: mocks.consumeFiscalSnapshotGrant,
}));
vi.mock("@/lib/server/authorized-arca-qr-grant", () => ({
  consumeAuthorizedArcaQrGrant: mocks.consumeQrGrant,
  getTenantIssuerCuit: mocks.getTenantIssuerCuit,
}));

import { processSaleAction } from "@/actions/sales/process";

const fiscalSnapshot = {
  version: 1,
  total: 2750,
  netAmount: 2272.73,
  vatAmount: 477.27,
};

const invoiceInput = {
  total: 2750,
  totalWithDiscount: 2750,
  seller: "Synthetic QA seller",
  paidMethod: "Tarjeta",
  products: [],
  billType: "Factura B",
  clientIvaCondition: "Consumidor Final",
  clientDocumentType: "" as const,
  clientDocumentNumber: "",
  CAE: {
    CAE: "12345678901234",
    vencimiento: "20261231",
    nroComprobante: 345,
    ptoVenta: 12,
    fiscalSnapshotToken: "authorized-fiscal-snapshot-token",
  },
};

function transactionClient() {
  return {
    cashboxSession: {
      findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }),
    },
    order: { create: mocks.createOrder },
    stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    cashBox: { update: vi.fn().mockResolvedValue({ id: "cashbox-1" }) },
    cashMovement: { create: vi.fn().mockResolvedValue({ id: "cash-movement-1" }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1", businessId: "business-1" } });
  mocks.after.mockImplementation(() => undefined);
  mocks.bulkUpdateStock.mockResolvedValue(undefined);
  mocks.consumeFiscalSnapshotGrant.mockResolvedValue(fiscalSnapshot);
  mocks.consumeQrGrant.mockResolvedValue(undefined);
  mocks.getTenantIssuerCuit.mockResolvedValue(null);
  mocks.createOrder.mockResolvedValue({ id: "persisted-order-345" });
  mocks.transaction.mockImplementation(
    async (callback: (tx: ReturnType<typeof transactionClient>) => Promise<unknown>) =>
      callback(transactionClient()),
  );
});

describe("order QR policy version persistence regression", () => {
  it("persists policy version 1 with the CAE and existing invoice/fiscal snapshot fields", async () => {
    const result = await processSaleAction(invoiceInput);
    const createArgs = mocks.createOrder.mock.calls[0]?.[0] as
      | { data: Record<string, unknown> }
      | undefined;

    expect(result).toEqual({ success: true, orderId: "persisted-order-345" });
    expect(mocks.consumeFiscalSnapshotGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: "business-1",
        cae: invoiceInput.CAE.CAE,
        billType: "Factura B",
        invoiceNumber: 345,
        pointOfSale: 12,
        total: 2750,
      }),
    );
    expect(createArgs?.data).toMatchObject({
      CAE: {
        CAE: invoiceInput.CAE.CAE,
        vencimiento: invoiceInput.CAE.vencimiento,
        nroComprobante: 345,
        ptoVenta: 12,
      },
      qrDataPolicyVersion: 1,
      billType: "Factura B",
      afipVoucherType: 6,
      invoiceNumber: 345,
      invoicePointOfSale: 12,
      invoiceIssuedAt: expect.any(Date),
      fiscalSnapshot,
    });
  });

  it("keeps a non-CAE sale compatible and leaves the policy version to the database default", async () => {
    const result = await processSaleAction({
      total: 50,
      totalWithDiscount: 50,
      seller: "Synthetic QA seller",
      paidMethod: "Tarjeta",
      products: [],
    });
    const createArgs = mocks.createOrder.mock.calls[0]?.[0] as
      | { data: Record<string, unknown> }
      | undefined;

    expect(result).toEqual({ success: true, orderId: "persisted-order-345" });
    expect(createArgs?.data).not.toHaveProperty("CAE");
    expect(createArgs?.data).not.toHaveProperty("qrDataPolicyVersion");
    expect(createArgs?.data).toMatchObject({
      afipVoucherType: null,
      invoiceNumber: null,
      invoicePointOfSale: null,
      invoiceIssuedAt: null,
    });
  });

  it("fails the local sale transaction after order creation fails without running later local writes", async () => {
    mocks.createOrder.mockRejectedValue(new Error("simulated order.create failure"));
    const tx = transactionClient();
    mocks.transaction.mockImplementation(async (
      callback: (transaction: ReturnType<typeof transactionClient>) => Promise<unknown>,
    ) => callback(tx));

    const result = await processSaleAction({
      ...invoiceInput,
      paidMethod: "Efectivo",
      products: [{ id: "product-1", code: "P1", description: "Test", salePrice: 2750, amount: 1 }],
    });

    expect(mocks.consumeFiscalSnapshotGrant).toHaveBeenCalledTimes(1);
    expect(mocks.createOrder).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: false, error: "Error al procesar la venta" });
    expect(mocks.bulkUpdateStock).not.toHaveBeenCalled();
    expect(tx.stockMovement.createMany).not.toHaveBeenCalled();
    expect(tx.cashBox.update).not.toHaveBeenCalled();
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe("Order QR policy schema and migration source contract", () => {
  const repositoryRoot = process.cwd();
  const schema = readFileSync(resolve(repositoryRoot, "prisma/schema.prisma"), "utf8");
  const migrationsPath = resolve(repositoryRoot, "prisma/migrations");
  const migrationFiles = readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsPath, entry.name, "migration.sql"))
    .filter((path) => {
      try {
        return readFileSync(path, "utf8").includes('ADD COLUMN "qrDataPolicyVersion"');
      } catch {
        return false;
      }
    });

  it("keeps one canonical non-null Order scalar with default version 1", () => {
    const orderModel = schema.match(/model Order \{([\s\S]*?)\n\}/)?.[1];

    expect(orderModel).toBeDefined();
    expect(orderModel?.match(/\bqrDataPolicyVersion\b/g)).toHaveLength(1);
    expect(orderModel).toMatch(/\bqrDataPolicyVersion\s+Int\s+@default\(1\)/);
  });

  it("uses the existing migration for old-row version 0 backfill and default 1, not a duplicate", () => {
    expect(migrationFiles).toHaveLength(1);
    const migration = readFileSync(migrationFiles[0]!, "utf8");

    expect(migration).toMatch(/UPDATE\s+"Order"\s+SET\s+"qrDataPolicyVersion"\s*=\s*0\s*;/);
    expect(migration).toMatch(/ALTER\s+TABLE\s+"Order"\s+ALTER\s+COLUMN\s+"qrDataPolicyVersion"\s+SET\s+DEFAULT\s+1\s*;/);
    expect(migration).toMatch(/ALTER\s+TABLE\s+"Order"\s+ALTER\s+COLUMN\s+"qrDataPolicyVersion"\s+SET\s+NOT\s+NULL\s*;/);
    expect(migration).toContain('CREATE TABLE "AuthorizedArcaQrGrant"');
    expect(migration).toContain('CREATE UNIQUE INDEX "AuthorizedArcaQrGrant_tokenHash_key"');
    expect(migration).toContain('CREATE INDEX "AuthorizedArcaQrGrant_businessId_cae_consumedAt_idx"');
    expect(migration).toContain('CREATE INDEX "AuthorizedArcaQrGrant_expiresAt_idx"');
    expect(migration).toContain('CONSTRAINT "AuthorizedArcaQrGrant_businessId_fkey"');
  });
});
