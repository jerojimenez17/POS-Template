import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { axiosPostMock, requireFeatureMock, credentialsMock, voucherNumberMock } = vi.hoisted(() => ({
  axiosPostMock: vi.fn(),
  requireFeatureMock: vi.fn(),
  credentialsMock: vi.fn(),
  voucherNumberMock: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    post: axiosPostMock,
    isAxiosError: () => false,
  },
}));
vi.mock("@/lib/auth-gates", () => ({ requireFeature: requireFeatureMock }));
vi.mock("@/lib/server/arca-billing", () => ({
  getArcaCredentialsForBilling: credentialsMock,
  getVoucherNumberForActor: voucherNumberMock,
}));

import {
  issuePreparedAfipVoucher,
  prepareAfipVoucherForActor,
  type PreparedAfipVoucher,
} from "@/lib/server/afip-voucher";
import type BillState from "@/models/BillState";

const actor = { id: "admin-1", role: "ADMIN", businessId: "business-1", business: null };
const fiscalSnapshot = {
  version: 1,
  source: "AUTHORIZED_VOUCHER",
  billType: "Factura B",
  afipVoucherType: 6,
  issuerIvaCondition: "Responsable Inscripto",
  buyerIvaCondition: "Consumidor Final",
  currency: "ARS",
  total: 100,
  net: 82.64,
  vat: 17.36,
  nonTaxed: 0,
  exempt: 0,
  otherTaxes: 0,
  iva: [{ id: 5, base: 82.64, amount: 17.36 }],
} as const;
const fiscalBreakdown = {
  source: "AUTHORIZED_VOUCHER",
  version: 1,
  originalAfipVoucherType: 6,
  ImpTotal: 100,
  ImpNeto: 82.64,
  ImpIVA: 17.36,
  ImpTotConc: 0,
  ImpOpEx: 0,
  ImpTrib: 0,
  Iva: [{ Id: 5, BaseImp: 82.64, Importe: 17.36 }],
} as const;
const billState = {
  id: "credit-note-1",
  billType: "Factura B",
  ptoVenta: 9,
  nroAsociado: 45,
  ptoVentaAsociado: 3,
  CbtesAsoc: [{ Tipo: 6, PtoVta: 3, Nro: 45 }],
  total: 100,
  totalWithDiscount: 100,
  fiscalSnapshot,
  fiscalBreakdown,
  products: [{ id: "product-1", code: "P1", description: "Product", price: 100, salePrice: 100, amount: 1 }],
  date: new Date("2026-09-30T12:00:00.000Z"),
} as unknown as BillState;

describe("trusted AFIP prepared voucher capability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-access-token");
    vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-api-key");
    requireFeatureMock.mockResolvedValue({ success: true, data: actor });
    credentialsMock.mockResolvedValue({
      success: { cuit: "20123456789", cert: "encrypted-cert", key: "encrypted-key", ptoVentas: [9, 12] },
    });
    voucherNumberMock.mockResolvedValue({ success: 76 });
    axiosPostMock.mockResolvedValue({
      status: 200,
      data: { success: true, data: { CAE: "98765432101234", nroCbte: 77, ptoVenta: 9 } },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("issues only the opaque actor-bound capability returned after trusted preflight, once", async () => {
    const result = await prepareAfipVoucherForActor(billState, actor);

    expect(result).toHaveProperty("success", true);
    if (!("prepared" in result)) throw new Error("Expected trusted preflight to return a prepared capability");
    const prepared = result.prepared;

    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.keys(prepared)).toHaveLength(0);
    expect(JSON.stringify(prepared)).toBe("{}");
    expect(requireFeatureMock).toHaveBeenCalledWith("hasAfipBilling", actor);
    expect(credentialsMock).toHaveBeenCalledWith("business-1");
    expect(voucherNumberMock).toHaveBeenCalledWith(9, 8, "credit-note", {
      businessId: "business-1",
      role: "ADMIN",
    });

    const forged = Object.freeze(Object.create(null)) as PreparedAfipVoucher;
    const forgedResult = await issuePreparedAfipVoucher(forged);
    expect(forgedResult).toMatchObject({ error: expect.stringMatching(/prevalidación/i), issuanceNotStarted: true });
    expect(axiosPostMock).not.toHaveBeenCalled();

    const issued = await issuePreparedAfipVoucher(prepared);
    expect(issued).toMatchObject({ success: true, data: { cae: "98765432101234", nroComprobante: 77, ptoVenta: 9 } });
    expect(requireFeatureMock).toHaveBeenLastCalledWith("hasAfipBilling", actor);
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    const [, payload] = axiosPostMock.mock.calls[0] as [string, {
      arca: { puntoVenta: number };
      billState: { ptoVentaAsociado: number; CbtesAsoc: Array<{ Tipo: number; PtoVta: number; Nro: number }> };
    }];
    expect(payload.arca.puntoVenta).toBe(9);
    expect(payload.billState).toMatchObject({
      ptoVentaAsociado: 3,
      CbtesAsoc: [{ Tipo: 6, PtoVta: 3, Nro: 45 }],
    });
    expect(payload.arca.puntoVenta).not.toBe(payload.billState.ptoVentaAsociado);

    const replayed = await issuePreparedAfipVoucher(prepared);
    expect(replayed).toMatchObject({ error: expect.stringMatching(/prevalidación/i), issuanceNotStarted: true });
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
  });

  it("rejects issuance as definitively not started when emission POS configuration changes after preflight", async () => {
    credentialsMock
      .mockResolvedValueOnce({
        success: { cuit: "20123456789", cert: "encrypted-cert", key: "encrypted-key", ptoVentas: [9, 12] },
      })
      .mockResolvedValueOnce({
        success: { cuit: "20123456789", cert: "encrypted-cert", key: "encrypted-key", ptoVentas: [12] },
      });

    const preparedResult = await prepareAfipVoucherForActor(billState, actor);

    expect(preparedResult).toHaveProperty("success", true);
    if (!("prepared" in preparedResult)) throw new Error("Expected trusted preflight to return a prepared capability");
    expect(voucherNumberMock).toHaveBeenCalledWith(9, 8, "credit-note", {
      businessId: "business-1",
      role: "ADMIN",
    });

    const issued = await issuePreparedAfipVoucher(preparedResult.prepared);

    expect(issued).toMatchObject({
      error: expect.stringMatching(/configuración.*cambió/i),
      issuanceNotStarted: true,
    });
    expect(axiosPostMock).not.toHaveBeenCalled();
  });
});
