import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, axiosPostMock, businessFindUniqueMock, orderFindFirstMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  axiosPostMock: vi.fn(),
  businessFindUniqueMock: vi.fn(),
  orderFindFirstMock: vi.fn(),
  dbMock: {
    business: { findUnique: vi.fn() },
    order: { findFirst: vi.fn() },
    saleReturn: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    cashboxSession: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("axios", () => ({
  default: { post: axiosPostMock, isAxiosError: () => false },
}));

import { createAfipVoucherAction } from "@/actions/afip";
import { createCreditNoteAction } from "@/actions/sales/credit-note";
import { issuePreparedAfipVoucher, prepareAfipVoucherForActor } from "@/lib/server/afip-voucher";
import { buildCreditNoteVoucherState } from "@/services/afip/credit-note";
import type BillState from "@/models/BillState";

const business = {
  id: "business-1",
  features: { hasAfipBilling: true },
  cuit: "20123456789",
  cert: "encrypted-cert",
  key: "encrypted-key",
  ptoVenta: [9, 12],
};

const actor = {
  id: "user-1",
  businessId: "business-1",
  role: "ADMIN",
  email: "actor@example.com",
  business: null,
};

const order = {
  id: "sale-1",
  businessId: "business-1",
  paidStatus: "pago",
  total: 100,
  seller: "seller@example.com",
  billType: "Factura B",
  afipVoucherType: 6,
  invoiceNumber: 45,
  invoicePointOfSale: 3,
  CAE: "12345678901234",
  clientIvaCondition: "Consumidor Final",
  clientDocumentType: null,
  clientDocumentNumber: null,
  items: [{
    id: "line-1", productId: "product-1", code: "P1", description: "Product",
    quantity: 1, price: 100, costPrice: 60, subTotal: 100,
  }],
  returns: [] as Array<Record<string, unknown>>,
};

const request = {
  orderId: "sale-1",
  idempotencyKey: "credit-note-sale-1",
  confirmed: true as const,
};

const transactionClients: Array<{ saleReturn: { create: ReturnType<typeof vi.fn> } }> = [];

const savedReturn = {
  id: "return-1",
  kind: "CREDIT_NOTE",
  status: "PENDING" as "PENDING" | "AUTHORIZED" | "REJECTED",
  idempotencyKey: request.idempotencyKey,
  creditNoteCAE: null as string | null,
  creditNoteNumber: null as number | null,
  creditNotePointOfSale: null as number | null,
};

function parseFetchBody(callIndex: number): Record<string, unknown> {
  const call = vi.mocked(fetch).mock.calls[callIndex];
  if (!call) throw new Error(`Expected fetch call ${callIndex}`);
  const init = call[1];
  if (!init || typeof init.body !== "string") throw new Error("Expected serialized getLastVoucher body");
  return JSON.parse(init.body) as Record<string, unknown>;
}

function setupDatabase() {
  transactionClients.length = 0;
  Object.assign(savedReturn, {
    status: "PENDING",
    creditNoteCAE: null,
    creditNoteNumber: null,
    creditNotePointOfSale: null,
  });
  order.returns = [];
  businessFindUniqueMock.mockResolvedValue(business);
  dbMock.business.findUnique.mockImplementation(businessFindUniqueMock);
  orderFindFirstMock.mockResolvedValue(order);
  dbMock.order.findFirst.mockImplementation(orderFindFirstMock);
  dbMock.saleReturn.findFirst.mockResolvedValue(null);
  dbMock.saleReturn.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(savedReturn, data);
    order.returns = [savedReturn];
    return savedReturn;
  });
  dbMock.saleReturn.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(savedReturn, data);
    return savedReturn;
  });
  dbMock.saleReturn.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(savedReturn, data);
    return { count: 1 };
  });
  dbMock.cashboxSession.findFirst.mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" });
  dbMock.$transaction.mockImplementation(async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: order.id }]),
      business: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === business.id ? business : null),
      },
      order: { findFirst: vi.fn(async () => ({ ...order, returns: [...order.returns] })) },
      saleReturn: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(savedReturn, data);
          order.returns = [savedReturn];
          return savedReturn;
        }),
        updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(savedReturn, data);
          return { count: 1 };
        }),
        findUnique: vi.fn(async () => savedReturn),
      },
      saleReturnItem: { createMany: vi.fn(async () => ({ count: 1 })) },
      product: { update: vi.fn(async () => ({})) },
      stockMovement: { createMany: vi.fn(async () => ({ count: 1 })) },
      cashboxSession: { findFirst: vi.fn(async () => ({ id: "session-1", cashboxId: "cashbox-1" })) },
      cashBox: { update: vi.fn(async () => ({})) },
      cashMovement: { create: vi.fn(async () => ({})) },
    };
    transactionClients.push(tx);
    return callback(tx);
  });
}

function setupTransport() {
  vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-access-token");
  vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-api-key");
  vi.stubEnv("NEXT_PUBLIC_GET_LAST_VOUCHER_URL", "https://example.test/get-last-voucher");
  vi.stubEnv("NEXT_PUBLIC_AFIP_FUNCTION_URL", "https://example.test/create-voucher");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ lastVoucher: 76 }),
  }));
  axiosPostMock.mockResolvedValue({
    status: 200,
    data: { success: true, data: { CAE: "98765432101234", nroCbte: 77, ptoVenta: 9 } },
  });
}

describe("credit-note emission point of sale is distinct from original association POS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransport();
    setupDatabase();
    authMock.mockResolvedValue({ user: actor });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("builds emission POS 9 independently from the original invoice POS 3", () => {
    const state = buildCreditNoteVoucherState({
      billType: "Factura B",
      emissionPointOfSale: 9,
      nroAsociado: 45,
      ptoVentaAsociado: 3,
      caeAsociado: "12345678901234",
      products: [{ id: "product-1", code: "P1", description: "Product", price: 60, salePrice: 100, amount: 1 }],
      total: 100,
      totalWithDiscount: 100,
      IVACondition: "Consumidor Final",
    });

    expect(state).toMatchObject({
      ptoVenta: 9,
      ptoVentaAsociado: 3,
      nroAsociado: 45,
      CbtesAsoc: [{ Tipo: 6, PtoVta: 3, Nro: 45 }],
    });
    expect(state.ptoVenta).not.toBe(state.ptoVentaAsociado);
  });

  it("uses persisted Business.ptoVenta[0] for last-number lookup and actual createVoucher transport", async () => {
    const result = await createCreditNoteAction(request);

    expect(result).toMatchObject({
      success: true,
      data: { creditNoteCAE: "98765432101234", creditNoteNumber: 77, creditNotePointOfSale: 9 },
    });
    expect(dbMock.business.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "business-1" } }));
    expect(orderFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sale-1", businessId: "business-1" },
    }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(parseFetchBody(0)).toMatchObject({ action: "getLastVoucher", puntoVenta: 9, tipoFactura: 8 });
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    const [url, payload] = axiosPostMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("https://example.test/create-voucher");
    expect(payload).toMatchObject({
      action: "createVoucher",
      arca: { puntoVenta: 9, tipoFactura: 8 },
      billState: {
        nroAsociado: 45,
        ptoVentaAsociado: 3,
        CbtesAsoc: [{ Tipo: 6, PtoVta: 3, Nro: 45 }],
      },
    });
    const arca = payload.arca as { puntoVenta: unknown };
    expect(typeof arca.puntoVenta).toBe("number");
    expect(Number.isSafeInteger(arca.puntoVenta)).toBe(true);
    expect(arca.puntoVenta).toBeGreaterThan(0);
    expect(arca.puntoVenta).not.toBe((payload.billState as { ptoVentaAsociado: number }).ptoVentaAsociado);
    expect(transactionClients[0]?.saleReturn.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ originalPointOfSale: 3 }),
    }));
  });

  it("does not accept a public emission POS override on the strict credit-note request", async () => {
    const result = await createCreditNoteAction({ ...request, ptoVenta: 12 });

    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
    expect(dbMock.order.findFirst).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
  });

  it("does not let the public generic voucher action use its caller-selected POS for a credit note", async () => {
    const genericCreditNote = {
      id: "forged-credit-note",
      billType: "Factura B",
      ptoVenta: 12,
      nroAsociado: 45,
      ptoVentaAsociado: 3,
      total: 100,
      totalWithDiscount: 100,
      date: new Date("2026-10-01T00:00:00.000Z"),
      products: [{ id: "product-1", code: "P1", description: "Product", price: 100, salePrice: 100, amount: 1 }],
    } as unknown as BillState;

    await createAfipVoucherAction(genericCreditNote);

    const lookupPoints = vi.mocked(fetch).mock.calls.map((_call, index) => parseFetchBody(index).puntoVenta);
    const createPoints = axiosPostMock.mock.calls.map(([, payload]) =>
      (payload as { arca: { puntoVenta: number } }).arca.puntoVenta,
    );
    expect(lookupPoints).not.toContain(12);
    expect(createPoints).not.toContain(12);
    if (lookupPoints.length > 0 || createPoints.length > 0) {
      expect(lookupPoints).toEqual([9]);
      expect(createPoints).toEqual([9]);
    } else {
      expect(axiosPostMock).not.toHaveBeenCalled();
    }
  });

  it("rejects a prepared credit note whose selected POS is configured but not Business.ptoVenta[0]", async () => {
    const state = buildCreditNoteVoucherState({
      billType: "Factura B", emissionPointOfSale: 12, nroAsociado: 45,
      ptoVentaAsociado: 3, caeAsociado: order.CAE,
      products: [{ id: "product-1", code: "P1", description: "Product", price: 60, salePrice: 100, amount: 1 }],
      total: 100, totalWithDiscount: 100, IVACondition: "Consumidor Final",
    });
    // Exercise the server guard with a syntactically valid but non-selected
    // value, even before the builder learns to populate the trusted field.
    state.ptoVenta = 12;

    const result = await prepareAfipVoucherForActor(state as unknown as BillState, actor);

    expect(result).toHaveProperty("issuanceNotStarted", true);
    expect(fetch).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing Business", null],
    ["empty configured list", { ...business, ptoVenta: [] }],
    ["missing first configured POS", { ...business, ptoVenta: [undefined, 12] }],
    ["null configured POS", { ...business, ptoVenta: [null, 12] }],
    ["string configured POS", { ...business, ptoVenta: ["9", 12] }],
    ["boolean configured POS", { ...business, ptoVenta: [true, 12] }],
    ["zero configured POS", { ...business, ptoVenta: [0, 12] }],
    ["negative configured POS", { ...business, ptoVenta: [-1, 12] }],
    ["fractional configured POS", { ...business, ptoVenta: [9.5, 12] }],
    ["unsafe configured POS", { ...business, ptoVenta: [Number.MAX_SAFE_INTEGER + 1, 12] }],
    ["NaN configured POS", { ...business, ptoVenta: [Number.NaN, 12] }],
    ["infinite configured POS", { ...business, ptoVenta: [Number.POSITIVE_INFINITY, 12] }],
  ])("fails closed for %s before lookup, reservation, or createVoucher", async (_case, configuredBusiness) => {
    businessFindUniqueMock.mockResolvedValue(configuredBusiness);
    dbMock.business.findUnique.mockImplementation(businessFindUniqueMock);

    const result = await createCreditNoteAction(request);

    expect(result).toMatchObject({ success: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.update).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.updateMany).not.toHaveBeenCalled();
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid original POS even when the configured emission POS is valid", async () => {
    orderFindFirstMock.mockResolvedValue({ ...order, invoicePointOfSale: 0 });
    dbMock.order.findFirst.mockImplementation(orderFindFirstMock);

    const result = await createCreditNoteAction(request);

    expect(result).toMatchObject({ success: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("stops after failed read-only getLastVoucher without creating or claiming a reservation", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service unavailable",
      text: async () => "temporary failure",
    } as Response);

    const result = await createCreditNoteAction(request);

    expect(result).toMatchObject({ success: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(parseFetchBody(0)).toMatchObject({ puntoVenta: 9, tipoFactura: 8 });
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.update).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.updateMany).not.toHaveBeenCalled();
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("uses only the persisted first emission POS and preserves original POS when it is not configured", async () => {
    business.ptoVenta = [9, 12];
    order.invoicePointOfSale = 3;

    const state = buildCreditNoteVoucherState({
      billType: "Factura B", emissionPointOfSale: business.ptoVenta[0], nroAsociado: 45,
      ptoVentaAsociado: order.invoicePointOfSale, caeAsociado: order.CAE,
      products: [{ id: "product-1", code: "P1", description: "Product", price: 60, salePrice: 100, amount: 1 }],
      total: 100, totalWithDiscount: 100, IVACondition: "Consumidor Final",
    });

    const prepared = await prepareAfipVoucherForActor(state as unknown as BillState, actor);
    expect(prepared).toHaveProperty("success", true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(parseFetchBody(0)).toMatchObject({ puntoVenta: 9, tipoFactura: 8 });
    expect(state).toMatchObject({ ptoVenta: 9, ptoVentaAsociado: 3, CbtesAsoc: [{ PtoVta: 3, Nro: 45, Tipo: 6 }] });

    if ("prepared" in prepared) {
      const issued = await issuePreparedAfipVoucher(prepared.prepared);
      expect(issued).toHaveProperty("success", true);
      expect(axiosPostMock).toHaveBeenCalledTimes(1);
      const payload = axiosPostMock.mock.calls[0]?.[1] as { arca: { puntoVenta: number } };
      expect(payload.arca.puntoVenta).toBe(9);
    }
  });
});
