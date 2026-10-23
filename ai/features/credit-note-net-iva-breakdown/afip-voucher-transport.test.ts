import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { axiosPostMock, requireFeatureMock, credentialsMock, voucherNumberMock } = vi.hoisted(() => ({
  axiosPostMock: vi.fn(),
  requireFeatureMock: vi.fn(),
  credentialsMock: vi.fn(),
  voucherNumberMock: vi.fn(),
}));

vi.mock("axios", () => ({
  default: { post: axiosPostMock, isAxiosError: () => false },
}));
vi.mock("@/lib/auth-gates", () => ({ requireFeature: requireFeatureMock }));
vi.mock("@/lib/server/arca-billing", () => ({
  getArcaCredentialsForBilling: credentialsMock,
  getVoucherNumberForActor: voucherNumberMock,
}));

import { issuePreparedAfipVoucher, prepareAfipVoucherForActor } from "@/lib/server/afip-voucher";
import type BillState from "@/models/BillState";

const actor = { id: "actor-1", businessId: "tenant-1", role: "ADMIN", email: "qa@example.test", business: null };
const fiscalBreakdown = {
  source: "AUTHORIZED_VOUCHER",
  version: 1,
  originalAfipVoucherType: 1,
  ImpTotal: 121,
  ImpNeto: 100,
  ImpIVA: 21,
  ImpTotConc: 0,
  ImpOpEx: 0,
  ImpTrib: 0,
  Iva: [{ Id: 5, BaseImp: 100, Importe: 21 }],
};

function billState(overrides: Record<string, unknown> = {}): BillState {
  return {
    id: "credit-note-1",
    billType: "Factura A",
    ptoVenta: 9,
    nroAsociado: 45,
    ptoVentaAsociado: 3,
    caeAsociado: "12345678901234",
    CbtesAsoc: [{ Tipo: 1, PtoVta: 3, Nro: 45 }],
    products: [{ id: "sku-1", code: "SKU-1", description: "Changed catalog", price: 999, salePrice: 999, amount: 1 }],
    total: 121,
    totalWithDiscount: 121,
    discount: 0,
    IVACondition: "Consumidor Final",
    date: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  } as unknown as BillState;
}

function requestPayload(index = 0): Record<string, unknown> {
  const payload = axiosPostMock.mock.calls[index]?.[1];
  if (!payload || typeof payload !== "object") throw new Error("Expected createVoucher payload");
  return payload as Record<string, unknown>;
}

describe("createAFIPVoucher local transport contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-token");
    vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-key");
    vi.stubEnv("NEXT_PUBLIC_AFIP_FUNCTION_URL", "https://local.test/create-voucher");
    requireFeatureMock.mockResolvedValue({ success: true, data: { ...actor, businessId: "tenant-1", role: "ADMIN" } });
    credentialsMock.mockResolvedValue({ success: {
      cuit: "20123456789", cert: "encrypted-cert", key: "encrypted-key", ptoVentas: [9],
    } });
    voucherNumberMock.mockResolvedValue({ success: 76 });
    axiosPostMock.mockResolvedValue({ status: 200, data: { success: true, data: { CAE: "98765432101234", nroCbte: 77, ptoVenta: 9 } } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the validated fiscal breakdown through prepare and the actual HTTP serialization boundary", async () => {
    const prepared = await prepareAfipVoucherForActor(
      billState({ fiscalBreakdown }),
      actor as never,
    );
    expect(prepared).toHaveProperty("success", true);
    if (!("prepared" in prepared)) return;

    const issued = await issuePreparedAfipVoucher(prepared.prepared);

    expect(issued).toHaveProperty("success", true);
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(requestPayload().billState).toMatchObject({
      total: 121,
      totalWithDiscount: 121,
      discount: 0,
      nroAsociado: 45,
      ptoVentaAsociado: 3,
      CbtesAsoc: [{ Tipo: 1, PtoVta: 3, Nro: 45 }],
      fiscalBreakdown,
    });
  });

  it("rejects a credit note without a complete fiscal breakdown before number lookup or createVoucher", async () => {
    const prepared = await prepareAfipVoucherForActor(billState(), actor as never);

    expect(prepared).toHaveProperty("issuanceNotStarted", true);
    expect(voucherNumberMock).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it("does not accept an invalid positive-net / empty-Iva breakdown at the local boundary", async () => {
    const prepared = await prepareAfipVoucherForActor(
      billState({ fiscalBreakdown: { ...fiscalBreakdown, Iva: [] } }),
      actor as never,
    );

    expect(prepared).toHaveProperty("issuanceNotStarted", true);
    expect(voucherNumberMock).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it("preserves ordinary invoice totals, discount and product serialization without requiring a credit-note snapshot", async () => {
    const invoice = billState({
      seller: "Cajero",
      typeDocument: "FACTURA",
      twoMethods: false,
      secondPaidMethod: "Debito",
      totalSecondMethod: null,
      entrega: 0,
      pago: true,
      billType: "Factura B",
      paidMethod: "Efectivo",
      clientId: "client-2",
      client: "Consumidor Final",
      clientIvaCondition: "Consumidor Final",
      clientDocumentNumber: "20123456789",
      ptoVenta: 9,
      nroAsociado: undefined,
      ptoVentaAsociado: undefined,
      caeAsociado: undefined,
      CbtesAsoc: undefined,
      total: 100,
      totalWithDiscount: 90,
      discount: 10,
      products: [{ id: "sku-2", code: "SKU-2", description: "Normal sale", price: 100, salePrice: 100, amount: 1 }],
    });
    const prepared = await prepareAfipVoucherForActor(invoice, actor as never);
    expect(prepared).toHaveProperty("success", true);
    if (!("prepared" in prepared)) return;

    await issuePreparedAfipVoucher(prepared.prepared);

    expect(requestPayload().billState).toMatchObject({ total: 90, totalWithDiscount: 90, discount: 10 });
    expect((requestPayload().billState as Record<string, unknown>).products).toEqual([
      { id: "sku-2", code: "SKU-2", description: "Normal sale", price: 100, salePrice: 100, amount: 1 },
    ]);
  });
});
