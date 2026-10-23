import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  axiosPostMock,
  requireFeatureMock,
  credentialsMock,
  voucherNumberMock,
  grantCreateMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  axiosPostMock: vi.fn(),
  requireFeatureMock: vi.fn(),
  credentialsMock: vi.fn(),
  voucherNumberMock: vi.fn(),
  grantCreateMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("axios", () => ({
  default: { post: axiosPostMock, isAxiosError: () => false },
}));
vi.mock("@/lib/auth-gates", () => ({ requireFeature: requireFeatureMock }));
vi.mock("@/lib/server/arca-billing", () => ({
  getArcaCredentialsForBilling: credentialsMock,
  getVoucherNumberForActor: voucherNumberMock,
}));
vi.mock("@/lib/db", () => ({
  db: { authorizedFiscalSnapshotGrant: { create: grantCreateMock } },
}));

import { createAfipVoucherAction } from "@/actions/afip";

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

const actor = {
  id: "actor-1",
  businessId: "tenant-1",
  role: "ADMIN",
  email: "qa@example.test",
  business: null,
};

function invoiceState(overrides: Record<string, unknown> = {}) {
  return {
    id: "sale-1",
    seller: "Cajero",
    typeDocument: "FACTURA",
    twoMethods: false,
    secondPaidMethod: "Debito",
    totalSecondMethod: null,
    entrega: 0,
    pago: true,
    billType: "Factura B",
    paidMethod: "Efectivo",
    clientId: "client-1",
    client: "Consumidor Final",
    clientIvaCondition: "Consumidor Final",
    clientDocumentNumber: "20123456789",
    ptoVenta: 3,
    // Zero is the normal reducer/provider sentinel for an unassociated invoice.
    nroAsociado: 0,
    products: [{ id: "sku-1", code: "SKU-1", description: "Invoice item", price: 121, salePrice: 121, amount: 1 }],
    total: 121,
    totalWithDiscount: 121,
    discount: 0,
    IVACondition: "Consumidor Final",
    date: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  } as never;
}

function wirePayload(): Record<string, unknown> {
  const payload = axiosPostMock.mock.calls[0]?.[1];
  if (!payload || typeof payload !== "object") throw new Error("Expected the createVoucher wire payload");
  return payload as Record<string, unknown>;
}

describe("public AFIP action with provider's zero association sentinel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-token");
    vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-key");
    vi.stubEnv("NEXT_PUBLIC_AFIP_FUNCTION_URL", "https://local.test/create-voucher");
    authMock.mockResolvedValue({ user: actor });
    requireFeatureMock.mockResolvedValue({ success: true, data: actor });
    credentialsMock.mockResolvedValue({
      success: { cuit: "20123456789", cert: "encrypted-cert", key: "encrypted-key", ptoVentas: [3] },
    });
    voucherNumberMock.mockResolvedValue({ success: 44 });
    axiosPostMock.mockResolvedValue({
      status: 200,
      data: { success: true, data: { CAE: "12345678901234", nroCbte: 45, ptoVenta: 3, fiscalSnapshot: snapshot } },
    });
    grantCreateMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats Factura B with nroAsociado 0 as invoice type 6 / operation invoice", async () => {
    const result = await createAfipVoucherAction(invoiceState());

    expect(voucherNumberMock).toHaveBeenCalledWith(3, 6, "invoice", { businessId: "tenant-1", role: "ADMIN" });
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(wirePayload().arca).toMatchObject({ puntoVenta: 3, tipoFactura: 6 });
    const httpBillState = JSON.parse(JSON.stringify(wirePayload().billState)) as Record<string, unknown>;
    expect(httpBillState).not.toHaveProperty("nroAsociado");
    expect(result).toMatchObject({ success: true, data: { cae: "12345678901234", fiscalSnapshotToken: expect.any(String) } });
    expect(grantCreateMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a direct public credit-note request without a server-authorized snapshot", async () => {
    const result = await createAfipVoucherAction(invoiceState({
      billType: "Factura B",
      nroAsociado: 45,
      ptoVentaAsociado: 3,
      caeAsociado: "12345678901234",
    }));

    expect(result).toMatchObject({ error: expect.stringContaining("solo se procesan desde datos autorizados del servidor"), issuanceNotStarted: true });
    expect(voucherNumberMock).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(grantCreateMock).not.toHaveBeenCalled();
  });
});
