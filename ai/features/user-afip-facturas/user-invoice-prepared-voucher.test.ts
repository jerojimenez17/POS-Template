import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { axiosPostMock, requireFeatureMock, credentialsMock, voucherNumberMock, persistedBusinessFindUniqueMock } = vi.hoisted(() => ({
  axiosPostMock: vi.fn(),
  requireFeatureMock: vi.fn(),
  credentialsMock: vi.fn(),
  voucherNumberMock: vi.fn(),
  persistedBusinessFindUniqueMock: vi.fn(),
}));

vi.mock("axios", () => ({ default: { post: axiosPostMock, isAxiosError: () => false } }));
vi.mock("@/lib/auth-gates", () => ({ requireFeature: requireFeatureMock }));
vi.mock("@/lib/db", () => ({ db: { business: { findUnique: persistedBusinessFindUniqueMock } } }));
vi.mock("@/lib/server/arca-billing", () => ({
  getArcaCredentialsForBilling: credentialsMock,
  getVoucherNumberForActor: voucherNumberMock,
}));

import { issuePreparedAfipVoucher, prepareAfipVoucherForActor } from "@/lib/server/afip-voucher";
import type BillState from "@/models/BillState";

const user = {
  id: "user-1",
  role: "USER",
  businessId: "business-1",
  business: { accountStatus: "ACTIVE", features: { hasAfipBilling: true } },
};

function invoice(overrides: Record<string, unknown> = {}): BillState {
  return {
    id: "invoice-1",
    seller: "Caja",
    typeDocument: "FACTURA",
    IVACondition: "Responsable Inscripto",
    twoMethods: false,
    billType: "Factura B",
    paidMethod: "Efectivo",
    discount: 0,
    documentNumber: 0,
    total: 100,
    totalWithDiscount: 100,
    date: new Date("2026-10-01T12:00:00.000Z"),
    ptoVenta: 3,
    products: [{ id: "product-1", code: "P1", description: "Producto", price: 100, salePrice: 100, amount: 1 }],
    ...overrides,
  } as unknown as BillState;
}

function configureSuccessfulPreflight(actor = user) {
  requireFeatureMock.mockResolvedValue({ success: true, data: actor });
  persistedBusinessFindUniqueMock.mockResolvedValue({
    id: "business-1",
    features: { hasAfipBilling: true },
  });
  credentialsMock.mockResolvedValue({
    success: { cuit: "20123456789", cert: "encrypted-cert", key: "encrypted-key", ptoVentas: [3] },
  });
  voucherNumberMock.mockResolvedValue({ success: 76 });
  axiosPostMock.mockResolvedValue({
    status: 200,
    data: { success: true, data: { CAE: "98765432101234", nroCbte: 77, ptoVenta: 3 } },
  });
}

describe("trusted USER AFIP invoice preparation and issuance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireFeatureMock.mockReset();
    vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-access-token");
    vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-key");
    vi.stubEnv("NEXT_PUBLIC_AFIP_FUNCTION_URL", "https://afip.example.test/create-voucher");
    configureSuccessfulPreflight();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prepares and issues an ordinary USER invoice using server-side sequence and tenant context", async () => {
    const preparedResult = await prepareAfipVoucherForActor(invoice(), user);

    expect(preparedResult).toHaveProperty("success", true);
    if (!("prepared" in preparedResult)) throw new Error("Expected an opaque prepared invoice capability");
    expect(Object.keys(preparedResult.prepared)).toHaveLength(0);
    expect(requireFeatureMock).toHaveBeenCalledWith("hasAfipBilling", user);
    expect(credentialsMock).toHaveBeenCalledWith("business-1");
    expect(voucherNumberMock).toHaveBeenCalledWith(3, 6, "invoice", { businessId: "business-1", role: "USER" });

    const result = await issuePreparedAfipVoucher(preparedResult.prepared);

    expect(result).toMatchObject({ success: true, data: { cae: "98765432101234", nroComprobante: 77, ptoVenta: 3 } });
    expect(requireFeatureMock).toHaveBeenCalledTimes(2);
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(axiosPostMock.mock.calls[0]?.[1]).toMatchObject({
      action: "createVoucher",
      arca: { puntoVenta: 3, tipoFactura: 6 },
    });
  });

  it("does not widen the shared preparation helper to USER credit notes", async () => {
    const result = await prepareAfipVoucherForActor(invoice({
      nroAsociado: 45,
      ptoVentaAsociado: 3,
      CbtesAsoc: [{ Tipo: 6, PtoVta: 3, Nro: 45 }],
    }), user);

    expect(result).toMatchObject({ error: "No autorizado", issuanceNotStarted: true });
    expect(requireFeatureMock).not.toHaveBeenCalled();
    expect(credentialsMock).not.toHaveBeenCalled();
    expect(voucherNumberMock).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it.each(["USER", "ADMIN", "SUPER_ADMIN"])("keeps hasAfipBilling mandatory for %s", async (role) => {
    const actor = { ...user, role };
    requireFeatureMock.mockResolvedValue({ success: false, error: "Esta función no está habilitada en tu plan actual." });

    const result = await prepareAfipVoucherForActor(invoice(), actor);

    expect(result).toMatchObject({ error: "Esta función no está habilitada en tu plan actual.", issuanceNotStarted: true });
    expect(requireFeatureMock).toHaveBeenCalledWith("hasAfipBilling", actor);
    expect(credentialsMock).not.toHaveBeenCalled();
    expect(voucherNumberMock).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it("rechecks feature entitlement after preparation and before the irreversible request", async () => {
    requireFeatureMock
      .mockResolvedValueOnce({ success: true, data: user })
      .mockResolvedValueOnce({ success: false, error: "Facturación deshabilitada" });

    const preparedResult = await prepareAfipVoucherForActor(invoice(), user);
    expect(preparedResult).toHaveProperty("success", true);
    if (!("prepared" in preparedResult)) throw new Error("Expected preparation to succeed before entitlement revocation");

    const result = await issuePreparedAfipVoucher(preparedResult.prepared);

    expect(result).toMatchObject({ error: "Facturación deshabilitada", issuanceNotStarted: true });
    expect(requireFeatureMock).toHaveBeenCalledTimes(2);
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it.each([
    ["unsupported invoice type", invoice({ billType: "Nota de Crédito B" })],
    ["unconfigured point of sale", invoice({ ptoVenta: 9 })],
    ["non-positive total", invoice({ total: 0, totalWithDiscount: 0 })],
  ])("keeps the pre-issue validation for USER (%s)", async (_case, payload) => {
    const result = await prepareAfipVoucherForActor(payload, user);

    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("issuanceNotStarted", true);
    expect(voucherNumberMock).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it("does not issue when the authoritative sequence preflight fails", async () => {
    const admin = { ...user, role: "ADMIN" };
    configureSuccessfulPreflight(admin);
    voucherNumberMock.mockResolvedValue({ error: "sequence unavailable" });

    const result = await prepareAfipVoucherForActor(invoice(), admin);

    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("issuanceNotStarted", true);
    expect(voucherNumberMock).toHaveBeenCalledTimes(1);
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "SUPER_ADMIN"])("preserves the existing %s invoice helper path", async (role) => {
    const actor = { ...user, role };
    configureSuccessfulPreflight(actor);

    const preparedResult = await prepareAfipVoucherForActor(invoice(), actor);

    expect(preparedResult).toHaveProperty("success", true);
    expect(voucherNumberMock).toHaveBeenCalledWith(3, 6, "invoice", { businessId: "business-1", role });
  });
});
