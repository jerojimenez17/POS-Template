import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Product from "@/models/Product";
import { Suplier } from "@/models/Suplier";
import type BillState from "@/models/BillState";

const {
  authMock,
  axiosPostMock,
  requireFeatureMock,
  credentialsMock,
  voucherNumberMock,
  createGrantMock,
  prepareVoucherMock,
  issueVoucherMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  axiosPostMock: vi.fn(),
  requireFeatureMock: vi.fn(),
  credentialsMock: vi.fn(),
  voucherNumberMock: vi.fn(),
  createGrantMock: vi.fn(),
  prepareVoucherMock: vi.fn(),
  issueVoucherMock: vi.fn(),
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
vi.mock("@/lib/server/fiscal-snapshot-grant", () => ({
  createAuthorizedFiscalSnapshotGrant: createGrantMock,
}));
vi.mock("@/lib/server/afip-voucher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/afip-voucher")>();
  prepareVoucherMock.mockImplementation(actual.prepareAfipVoucherForActor);
  issueVoucherMock.mockImplementation(actual.issuePreparedAfipVoucher);
  return {
    ...actual,
    prepareAfipVoucherForActor: prepareVoucherMock,
    issuePreparedAfipVoucher: issueVoucherMock,
  };
});

import { createAfipVoucherAction } from "@/actions/afip";
import { parseAfipVoucherResponse } from "@/services/afip/voucher-response";
import { createBillCheckoutSnapshot } from "@/utils/billing";

const actor = {
  id: "admin-1",
  role: "ADMIN",
  businessId: "business-1",
  business: null,
};

function buildBillState(overrides: Record<string, unknown> = {}): BillState {
  return {
    id: "6",
    seller: "Cajero",
    typeDocument: "FACTURA",
    IVACondition: "Responsable Inscripto",
    twoMethods: false,
    totalSecondMethod: null,
    secondPaidMethod: "",
    entrega: 0,
    pago: true,
    billType: "Factura B",
    paidMethod: "Efectivo",
    clientId: "client-1",
    client: "Consumidor final",
    clientIvaCondition: "Consumidor Final",
    clientDocumentNumber: "20123456789",
    discount: 10,
    documentNumber: 0,
    total: 200,
    totalWithDiscount: 180,
    date: new Date("2026-10-01T12:34:56.000Z"),
    ptoVenta: 3,
    products: [],
    ...overrides,
  } as unknown as BillState;
}

function buildProduct(): Product {
  const supplier = Object.assign(new Suplier(), {
    id: "supplier-1",
    name: "Proveedor privado",
    privateNote: "no debe llegar a AFIP",
  });
  return Object.assign(new Product(), {
    id: "product-1",
    code: "P-001",
    description: "Producto de prueba",
    price: 100,
    salePrice: 125,
    amount: 2,
    suplier: supplier,
    surpriseProductField: "no-copy",
  });
}

function setValidActionDependencies() {
  authMock.mockResolvedValue({ user: actor });
  requireFeatureMock.mockResolvedValue({ success: true, data: actor });
  credentialsMock.mockResolvedValue({
    success: {
      cuit: "20123456789",
      cert: "encrypted-cert",
      key: "encrypted-key",
      ptoVentas: [3],
    },
  });
  voucherNumberMock.mockResolvedValue({ success: 76 });
  axiosPostMock.mockResolvedValue({
    status: 200,
    data: { success: true, data: { CAE: "98765432101234", nroCbte: 77, ptoVenta: 3 } },
  });
}

function buildAuthorizedFiscalSnapshot(total: number) {
  const net = total === 10 ? 8.26 : 7.44;
  const vat = total - net;
  return {
    version: 1,
    source: "AUTHORIZED_VOUCHER",
    billType: "Factura B",
    afipVoucherType: 6,
    issuerIvaCondition: "Responsable Inscripto",
    buyerIvaCondition: "Consumidor Final",
    currency: "ARS",
    total,
    net,
    vat,
    nonTaxed: 0,
    exempt: 0,
    otherTaxes: 0,
    iva: [{ id: 5, base: net, amount: vat }],
  };
}

function mockAuthorizedCloudFunctionResponse(snapshotTotal: number) {
  axiosPostMock.mockResolvedValueOnce({
    status: 200,
    data: {
      success: true,
      data: {
        CAE: "98765432101234",
        CAEFchVto: "20261015",
        nroCbte: 77,
        ptoVenta: 3,
        qrData: "authorized-voucher-qr",
        fiscalSnapshot: buildAuthorizedFiscalSnapshot(snapshotTotal),
      },
    },
  });
  createGrantMock.mockResolvedValueOnce("trusted-fiscal-snapshot-token");
  prepareVoucherMock.mockResolvedValueOnce({ success: true, prepared: {} });
  issueVoucherMock.mockImplementationOnce(async () => {
    const response = await axiosPostMock("http://localhost:5001/createAFIPVoucher", {}, {});
    const parsed = parseAfipVoucherResponse(response.data, {
      status: response.status,
      ptoVenta: 3,
      tipoFactura: 6,
    });
    if (parsed.kind !== "success") throw new Error("Expected an authorized local Cloud Function response");
    return { success: true, data: parsed.data };
  });
}

describe("AFIP serializable bill payload boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-access-token");
    vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-api-key");
    setValidActionDependencies();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("createBillCheckoutSnapshot", () => {
    it("projects Product and nested Suplier instances to a plain allowlisted checkout DTO", () => {
      const product = buildProduct();
      const state = buildBillState({
        products: [product],
        checkoutFrameworkReference: () => "temporary client reference",
      });

      const snapshot = createBillCheckoutSnapshot(state, "Factura B") as unknown as Record<string, unknown>;
      const snapshotProduct = (snapshot.products as Array<Record<string, unknown>>)[0];

      expect(snapshot.id).toBe("6");
      expect(snapshot.billType).toBe("Factura B");
      expect(snapshot.total).toBe(200);
      expect(snapshot.totalWithDiscount).toBe(180);
      expect(snapshot.discount).toBe(10);
      expect(snapshot.documentNumber).toBe(0);
      expect(snapshot.date).toBe("2026-10-01T12:34:56.000Z");
      expect(Object.getPrototypeOf(snapshot)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(snapshotProduct)).toBe(Object.prototype);
      expect(Object.keys(snapshotProduct).sort()).toEqual([
        "amount",
        "code",
        "description",
        "id",
        "price",
        "salePrice",
      ]);
      expect(snapshotProduct).toMatchObject({
        id: "product-1",
        code: "P-001",
        description: "Producto de prueba",
        price: 100,
        salePrice: 125,
        amount: 2,
      });
      expect(snapshotProduct).not.toHaveProperty("suplier");
      expect(snapshotProduct).not.toHaveProperty("surpriseProductField");
      expect(snapshot).not.toHaveProperty("checkoutFrameworkReference");
      expect(() => structuredClone(snapshot)).not.toThrow();
    });
  });

  describe("createAfipVoucherAction", () => {
    it("returns a serializable pre-issuance error for an unexpected unclonable field without posting", async () => {
      const billState = buildBillState({
        products: [buildProduct()],
        unexpectedClientValue: () => "cannot be cloned",
      });

      const result = await createAfipVoucherAction(billState);

      expect(result).toEqual({
        error: expect.any(String),
        issuanceNotStarted: true,
      });
      expect(Object.keys(result).sort()).toEqual(["error", "issuanceNotStarted"]);
      expect(() => structuredClone(result)).not.toThrow();
      expect(voucherNumberMock.mock.calls.length).toBeLessThanOrEqual(1);
      expect(axiosPostMock).not.toHaveBeenCalled();
      expect(createGrantMock).not.toHaveBeenCalled();
    });

    it("issues a valid Factura B exactly once with the existing price, amount, totals, and HTTP projection", async () => {
      const billState = buildBillState({ products: [buildProduct()] });

      const result = await createAfipVoucherAction(billState);

      expect(axiosPostMock).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ success: true });
      expect(() => structuredClone(result)).not.toThrow();

      const [, request, config] = axiosPostMock.mock.calls[0] as [
        string,
        {
          action: string;
          arca: { puntoVenta: number; tipoFactura: number };
          billState: Record<string, unknown> & { products: Array<Record<string, unknown>> };
        },
        { headers: Record<string, string> },
      ];
      expect(request.action).toBe("createVoucher");
      expect(request.arca).toMatchObject({ puntoVenta: 3, tipoFactura: 6 });
      expect(request.billState).toMatchObject({
        id: "6",
        billType: "Factura B",
        total: 180,
        totalWithDiscount: 180,
        discount: 10,
        documentNumber: 0,
        date: "2026-10-01T12:34:56.000Z",
      });
      expect(request.billState).not.toHaveProperty("ptoVenta");
      expect(request.billState.products).toEqual([{
        id: "product-1",
        code: "P-001",
        description: "Producto de prueba",
        price: 125,
        salePrice: 125,
        amount: 2,
      }]);
      expect(JSON.stringify(request)).not.toMatch(/suplier|Proveedor privado|no-copy|privateNote/i);
      expect(config.headers).toMatchObject({
        "Content-Type": "application/json",
        "x-internal-key": "test-internal-api-key",
      });
      expect(createGrantMock).not.toHaveBeenCalled();
    });

    it("creates and returns a fiscal snapshot grant when zero totalWithDiscount means the HTTP total", async () => {
      mockAuthorizedCloudFunctionResponse(10);

      const result = await createAfipVoucherAction(buildBillState({
        total: 10,
        totalWithDiscount: 0,
        discount: 0,
      }));

      expect(axiosPostMock).toHaveBeenCalledTimes(1);
      expect(createGrantMock).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        success: true,
        data: { fiscalSnapshotToken: "trusted-fiscal-snapshot-token" },
      });
    });

    it("does not create or return a fiscal snapshot grant when the authorized total differs", async () => {
      mockAuthorizedCloudFunctionResponse(9);

      const result = await createAfipVoucherAction(buildBillState({
        total: 10,
        totalWithDiscount: 0,
        discount: 0,
      }));

      expect(axiosPostMock).toHaveBeenCalledTimes(1);
      expect(createGrantMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ success: true });
      expect(result).not.toHaveProperty("data.fiscalSnapshotToken");
    });

    it.each([
      ["fiscalBreakdown", { fiscalBreakdown: { source: "AUTHORIZED_VOUCHER" } }],
      ["fiscalSnapshot", { fiscalSnapshot: { source: "AUTHORIZED_VOUCHER" } }],
      ["credit-note markers", { nroAsociado: 77, ptoVentaAsociado: 3, caeAsociado: "forged" }],
    ])("continues to reject client-supplied %s before preflight or issuance", async (_label, fields) => {
      const result = await createAfipVoucherAction(buildBillState(fields));

      expect(result).toMatchObject({
        error: expect.any(String),
        issuanceNotStarted: true,
      });
      expect(() => structuredClone(result)).not.toThrow();
      expect(voucherNumberMock).not.toHaveBeenCalled();
      expect(axiosPostMock).not.toHaveBeenCalled();
      expect(createGrantMock).not.toHaveBeenCalled();
    });

    it("keeps authorization guards ahead of credentials, preflight, and the Cloud Function", async () => {
      authMock.mockResolvedValue({ user: { ...actor, role: "CASHIER" } });

      const result = await createAfipVoucherAction(buildBillState());

      expect(result).toEqual({ error: "No autorizado", issuanceNotStarted: true });
      expect(() => structuredClone(result)).not.toThrow();
      expect(credentialsMock).not.toHaveBeenCalled();
      expect(voucherNumberMock).not.toHaveBeenCalled();
      expect(axiosPostMock).not.toHaveBeenCalled();
      expect(createGrantMock).not.toHaveBeenCalled();
    });
  });
});
