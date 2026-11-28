import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "tenant-production-log-fixture";
const ORDER_ID = "order-production-log-fixture";
const GRANT_ID = "grant-production-log-fixture";
const CAE = "12345678901234";
const PAYLOAD = {
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
  codAut: Number(CAE),
};

const state = {
  auth: vi.fn(),
  findOrder: vi.fn(),
  findGrant: vi.fn(),
  findGrantCandidates: vi.fn(),
  linkCas: vi.fn(),
  updateOrder: vi.fn(),
  findBusiness: vi.fn(),
  createGrant: vi.fn(),
  order: null as Record<string, unknown> | null,
  grant: null as Record<string, unknown> | null,
  casCount: 1,
  inTransaction: false,
  transactionEvents: [] as string[],
};

function makeOrder() {
  return {
    id: ORDER_ID,
    businessId: TENANT,
    total: new Prisma.Decimal("2750.00"),
    qrDataPolicyVersion: 1,
    billType: "Factura B",
    afipVoucherType: 6,
    invoiceNumber: 345,
    invoicePointOfSale: 12,
    clientIvaCondition: "Consumidor Final",
    clientDocumentType: null,
    clientDocumentNumber: null,
    CAE: { CAE, nroComprobante: 345, ptoVenta: 12 },
  };
}

function makeOrphan(overrides: Record<string, unknown> = {}) {
  return {
    id: GRANT_ID,
    businessId: TENANT,
    cae: CAE,
    billType: "Factura B",
    afipVoucherType: 6,
    invoiceNumber: 345,
    pointOfSale: 12,
    fiscalAmount: new Prisma.Decimal("2750.00"),
    issuerCuit: "30712345678",
    requestDate: new Date("2026-04-09T00:00:00.000Z"),
    recipientIvaCondition: "Consumidor Final",
    recipientDocumentType: null,
    recipientDocumentNumber: null,
    payload: PAYLOAD,
    rawQrData: null,
    consumedAt: new Date("2026-04-09T12:00:00.000Z"),
    orderId: null,
    ...overrides,
  };
}

function setupMocks() {
  const tx = {
    order: {
      findFirst: state.findOrder,
      update: state.updateOrder,
    },
    authorizedArcaQrGrant: {
      findMany: state.findGrantCandidates,
      findFirst: state.findGrant,
      updateMany: state.linkCas,
    },
    business: { findUnique: state.findBusiness },
  };
  const transaction = async (callback: (client: typeof tx) => Promise<unknown>) => {
    state.transactionEvents.push("transaction:start");
    state.inTransaction = true;
    try {
      const result = await callback(tx);
      state.transactionEvents.push("transaction:commit");
      return result;
    } finally {
      state.inTransaction = false;
    }
  };
  state.linkCas.mockImplementation(async () => {
    state.transactionEvents.push(`grant:link:${state.inTransaction ? "transaction" : "outside"}`);
    if (state.casCount !== 1 || state.grant?.orderId !== null) return { count: 0 };
    state.grant.orderId = ORDER_ID;
    return { count: 1 };
  });
  state.updateOrder.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    state.transactionEvents.push(`order:update:${state.inTransaction ? "transaction" : "outside"}`);
    if (state.order) state.order = { ...state.order, ...data };
    return state.order;
  });
  vi.doMock("@/auth", () => ({ auth: state.auth }));
  vi.doMock("@/lib/db", () => ({
    db: {
      ...tx,
      $transaction: transaction,
      authorizedArcaQrGrant: { ...tx.authorizedArcaQrGrant, create: state.createGrant },
    },
  }));
  vi.doMock("@/lib/server/qr-telemetry", () => ({ logQrTelemetry: vi.fn() }));
}

async function loadRecoveryModule(): Promise<Record<string, unknown>> {
  return await import("@/lib/server/authorized-arca-qr-grant") as unknown as Record<string, unknown>;
}

function requiredRepairAction(module: Record<string, unknown>): (orderId: string) => Promise<unknown> {
  const operation = module.repairOrphanedQrGrantAction;
  expect(
    typeof operation,
    "the explicit Server Action repairOrphanedQrGrantAction(orderId) must exist",
  ).toBe("function");
  return operation as (orderId: string) => Promise<unknown>;
}

async function loadRepairActionModule(): Promise<Record<string, unknown>> {
  return await import("@/actions/sales/qr-print") as unknown as Record<string, unknown>;
}

async function resolveOrderQr(module: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resolver = module.resolveOrderQrPrintDto;
  expect(typeof resolver, "resolveOrderQrPrintDto(orderId) must remain exported").toBe("function");
  return await (resolver as (orderId: string) => Promise<Record<string, unknown>>)(ORDER_ID);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.order = makeOrder();
  state.grant = makeOrphan();
  state.casCount = 1;
  state.inTransaction = false;
  state.transactionEvents = [];
  state.auth.mockResolvedValue({ user: { id: "qa-user", businessId: TENANT } });
  state.findOrder.mockImplementation(async () => state.order);
  state.findGrant.mockImplementation(async () => state.grant);
  state.findGrantCandidates.mockImplementation(async () => [state.grant]);
  state.findBusiness.mockResolvedValue({ cuit: "30712345678" });
  setupMocks();
});

describe("one-time production orphan-grant recovery", () => {
  it("repairs the exact consumed Decimal orphan once, resolves a verified URL, and generates non-empty SVG without issuance", async () => {
    const actionModule = await loadRepairActionModule();
    const repair = requiredRepairAction(actionModule);
    const resolverModule = await loadRecoveryModule();

    await expect(resolveOrderQr(resolverModule)).resolves.toEqual({ qrValue: null, qrKind: "none" });
    expect(state.linkCas).not.toHaveBeenCalled();
    expect(state.updateOrder).not.toHaveBeenCalled();

    await repair(ORDER_ID);
    const transactionWrites = [...state.transactionEvents];
    const dto = await resolveOrderQr(resolverModule);
    const svg = await QRCode.toString(String(dto.qrValue ?? ""), { type: "svg", margin: 0, width: 60 });

    expect(state.findGrantCandidates).toHaveBeenCalledTimes(1);
    const candidateQuery = state.findGrantCandidates.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    };
    expect(candidateQuery.where).toMatchObject({
      businessId: TENANT,
      cae: CAE,
      billType: "Factura B",
      afipVoucherType: 6,
      invoiceNumber: 345,
      pointOfSale: 12,
      issuerCuit: "30712345678",
      recipientIvaCondition: "Consumidor Final",
      recipientDocumentType: null,
      recipientDocumentNumber: null,
      orderId: null,
      consumedAt: { not: null },
    });
    expect(String(candidateQuery.where?.fiscalAmount)).toBe("2750.00");
    expect(state.linkCas).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: GRANT_ID, orderId: null }),
      data: expect.objectContaining({ orderId: ORDER_ID }),
    }));
    expect(state.auth).toHaveBeenCalled();
    expect(state.findOrder).toHaveBeenCalledWith({ where: { id: ORDER_ID, businessId: TENANT } });
    expect(transactionWrites).toEqual([
      "transaction:start",
      "grant:link:transaction",
      "order:update:transaction",
      "transaction:commit",
    ]);
    expect(state.transactionEvents).toEqual(transactionWrites);
    expect(state.grant?.orderId).toBe(ORDER_ID);
    expect((state.order?.CAE as Record<string, unknown>).qrAttestationId).toBe(GRANT_ID);
    expect(dto).toMatchObject({ qrKind: "verified-url" });
    expect(dto.qrValue).toEqual(expect.any(String));
    expect(svg).toContain("<svg");
    expect(svg.length).toBeGreaterThan(0);
    expect(state.createGrant).not.toHaveBeenCalled();
  });

  it.each([
    ["a binding mismatch", () => { state.grant = makeOrphan({ issuerCuit: "30987654321" }); }],
    ["multiple matching candidates", () => { state.findGrantCandidates.mockResolvedValue([makeOrphan(), makeOrphan({ id: "second-grant" })]); }],
    ["a lost orderId compare-and-set", () => { state.casCount = 0; }],
  ])("fails closed for %s and does not attach a grant", async (_label, arrange) => {
    arrange();
    const actionModule = await loadRepairActionModule();
    const repair = requiredRepairAction(actionModule);
    const module = await loadRecoveryModule();

    await repair(ORDER_ID);
    const dto = await resolveOrderQr(module);

    expect(dto).toEqual({ qrValue: null, qrKind: "none" });
    expect(state.order?.CAE).not.toHaveProperty("qrAttestationId");
    if (_label === "multiple matching candidates") expect(state.linkCas).not.toHaveBeenCalled();
    if (_label === "a lost orderId compare-and-set") expect(state.grant?.orderId).toBeNull();
  });

  it("keeps resolver reads read-only for an orphaned policy-v1 order", async () => {
    const module = await loadRecoveryModule();

    await expect(resolveOrderQr(module)).resolves.toEqual({ qrValue: null, qrKind: "none" });

    expect(state.linkCas).not.toHaveBeenCalled();
    expect(state.updateOrder).not.toHaveBeenCalled();
    expect(state.grant?.orderId).toBeNull();
    expect(state.order?.CAE).not.toHaveProperty("qrAttestationId");
  });
});
