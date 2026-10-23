import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, afterMock, orderCreateMock, findGrantMock, updateGrantMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  afterMock: vi.fn(),
  orderCreateMock: vi.fn(),
  findGrantMock: vi.fn(),
  updateGrantMock: vi.fn(),
  dbMock: { $transaction: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("@/lib/batch-utils", () => ({
  bulkUpdateStock: vi.fn().mockResolvedValue(undefined),
  processInBatches: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
import { db } from "@/lib/db";
import { processSaleAction } from "@/actions/sales/process";
import { createHash } from "node:crypto";

const token = "a".repeat(64);
const tokenHash = createHash("sha256").update(token).digest("hex");
const snapshot = {
  version: 1,
  source: "AUTHORIZED_VOUCHER",
  billType: "Factura B",
  afipVoucherType: 6,
  issuerIvaCondition: "Responsable Inscripto",
  buyerIvaCondition: "Consumidor Final",
  currency: "ARS",
  total: 121,
  net: 100,
  vat: 21,
  nonTaxed: 0,
  exempt: 0,
  otherTaxes: 0,
  iva: [{ id: 5, base: 100, amount: 21 }],
} as const;

const originalGrant = {
  id: "grant-1",
  tokenHash,
  businessId: "tenant-1",
  cae: "12345678901234",
  billType: "Factura B",
  invoiceNumber: 45,
  pointOfSale: 3,
  snapshot,
  consumedAt: null,
  expiresAt: new Date("2026-10-05T13:00:00.000Z"),
};

let grantRecord: Omit<typeof originalGrant, "consumedAt"> & { consumedAt: Date | null };
let persistedOrders: Array<Record<string, unknown>>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function input(overrides: {
  businessId?: string;
  cae?: string;
  billType?: string;
  invoiceNumber?: number | string;
  pointOfSale?: number | string;
} = {}) {
  return {
    total: 121,
    totalWithDiscount: 121,
    seller: "seller-1",
    paidMethod: "Tarjeta",
    products: [{ id: "sku-1", code: "SKU-1", description: "Item", price: 121, salePrice: 121, amount: 1 }],
    billType: overrides.billType ?? "Factura B",
    CAE: {
      CAE: overrides.cae ?? "12345678901234",
      vencimiento: "20261104",
      nroComprobante: overrides.invoiceNumber ?? 45,
      qrData: "qr-data",
      ptoVenta: overrides.pointOfSale ?? 3,
      fiscalSnapshotToken: token,
    },
  };
}

function setupTransaction(): void {
  const tx = {
    authorizedFiscalSnapshotGrant: {
      findFirst: findGrantMock,
      updateMany: updateGrantMock,
    },
    cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "cash-session-1", cashboxId: "cashbox-1" }) },
    order: {
      create: orderCreateMock,
    },
    stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    cashBox: { update: vi.fn().mockResolvedValue({}) },
    cashMovement: { create: vi.fn().mockResolvedValue({ id: "movement-1" }) },
  };
  vi.mocked(db.$transaction).mockImplementation(async (callback) => callback(tx as never) as never);
}

describe("authorized fiscal snapshot grant at sale persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00.000Z"));
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    grantRecord = { ...originalGrant };
    persistedOrders = [];
    authMock.mockResolvedValue({ user: { id: "user-1", businessId: "tenant-1", role: "ADMIN" } });
    afterMock.mockImplementation(() => undefined);
    orderCreateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      persistedOrders.push(data);
      return { id: `order-${persistedOrders.length}` };
    });
    findGrantMock.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      const expiresAtCondition = where.expiresAt as { gt: Date };
      const unconsumed = grantRecord.consumedAt === null;
      const unexpired = grantRecord.expiresAt > expiresAtCondition.gt;
      const matching = grantRecord.businessId === where.businessId
        && grantRecord.cae === where.cae
        && grantRecord.billType === where.billType
        && grantRecord.invoiceNumber === where.invoiceNumber
        && grantRecord.pointOfSale === where.pointOfSale;
      return where.tokenHash === grantRecord.tokenHash && unconsumed && unexpired && matching
        ? grantRecord
        : null;
    });
    updateGrantMock.mockImplementation(async () => {
      if (grantRecord.consumedAt !== null) return { count: 0 };
      grantRecord.consumedAt = new Date();
      return { count: 1 };
    });
    setupTransaction();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  it("consumes a valid server grant once and persists its normalized snapshot with the sale", async () => {
    const first = await processSaleAction(input());
    const second = await processSaleAction(input());

    expect(first).toMatchObject({ success: true });
    expect(second).toHaveProperty("error");
    expect(persistedOrders).toHaveLength(1);
    expect(persistedOrders[0]).toMatchObject({
      businessId: "tenant-1",
      CAE: { CAE: "12345678901234", nroComprobante: 45, ptoVenta: 3 },
      fiscalSnapshot: snapshot,
    });
    expect(grantRecord.consumedAt).toEqual(new Date("2026-10-05T12:00:00.000Z"));
    expect(updateGrantMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["different tenant", { businessId: "tenant-other" }],
    ["expired grant", {}],
    ["CAE mismatch", { cae: "99999999999999" }],
    ["bill type mismatch", { billType: "Factura A" }],
    ["invoice number mismatch", { invoiceNumber: 46 }],
    ["point-of-sale mismatch", { pointOfSale: 4 }],
  ] as Array<[string, { businessId?: string; cae?: string; billType?: string; invoiceNumber?: number; pointOfSale?: number }]>)("does not persist a snapshot for %s", async (label, overrides) => {
    if (label === "expired grant") grantRecord.expiresAt = new Date("2026-10-05T11:59:59.999Z");
    if (overrides.businessId) {
      authMock.mockResolvedValue({ user: { id: "user-1", businessId: overrides.businessId, role: "ADMIN" } });
    }

    const result = await processSaleAction(input(overrides));

    expect(result).toHaveProperty("error");
    expect(persistedOrders).toHaveLength(0);
    expect(orderCreateMock).not.toHaveBeenCalled();
    expect(grantRecord.consumedAt).toBeNull();
  });
});
