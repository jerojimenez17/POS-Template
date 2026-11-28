import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { captureConsoleCalls, expectSafeQrTelemetry } from "./qr-telemetry-test-helpers";

const mocks = vi.hoisted(() => ({
  axiosPost: vi.fn(),
  requireFeature: vi.fn(),
  credentials: vi.fn(),
  voucherNumber: vi.fn(),
  findBusiness: vi.fn(),
  createGrant: vi.fn(),
}));

vi.mock("axios", () => ({
  default: { post: mocks.axiosPost, isAxiosError: () => false },
}));
vi.mock("@/lib/auth-gates", () => ({ requireFeature: mocks.requireFeature }));
vi.mock("@/lib/db", () => ({
  db: {
    business: { findUnique: mocks.findBusiness },
    authorizedArcaQrGrant: { create: mocks.createGrant },
  },
}));
vi.mock("@/lib/server/arca-billing", () => ({
  getArcaCredentialsForBilling: mocks.credentials,
  getVoucherNumberForActor: mocks.voucherNumber,
}));

import { issuePreparedAfipVoucher, prepareAfipVoucherForActor } from "@/lib/server/afip-voucher";
import { createAuthorizedArcaQrGrant } from "@/lib/server/authorized-arca-qr-grant";
import type BillState from "@/models/BillState";

const ACTOR = { id: "qr-qa-user", role: "ADMIN", businessId: "qr-qa-tenant", business: null };

function invoice(overrides: Partial<BillState> = {}): BillState {
  return {
    id: "qr-qa-invoice",
    seller: "Synthetic QA seller",
    typeDocument: "DNI",
    IVACondition: "Consumidor Final",
    clientIvaCondition: "Consumidor Final",
    clientDocumentType: undefined,
    clientDocumentNumber: "",
    twoMethods: false,
    billType: "Factura B",
    discount: 0,
    documentNumber: 0,
    total: 2750,
    totalWithDiscount: 2750,
    date: new Date("2026-04-09T12:00:00.000Z"),
    ptoVenta: 12,
    products: [{ id: "product-qr-qa", code: "QR-1", description: "Synthetic item", price: 2750, salePrice: 2750, amount: 1 }],
    ...overrides,
  } as unknown as BillState;
}

async function issueInvoice(input: BillState = invoice()): Promise<Awaited<ReturnType<typeof issuePreparedAfipVoucher>>> {
  const prepared = await prepareAfipVoucherForActor(input, ACTOR as never, "2026-04-09");
  if (!("prepared" in prepared)) throw new Error("Expected prepared invoice capability");
  return issuePreparedAfipVoucher(prepared.prepared);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "synthetic-access-token");
  vi.stubEnv("INTERNAL_AFIP_API_KEY", "synthetic-internal-key");
  mocks.requireFeature.mockResolvedValue({ success: true, data: ACTOR });
  mocks.findBusiness.mockResolvedValue({ id: ACTOR.businessId, features: { hasAfipBilling: true } });
  mocks.credentials.mockResolvedValue({
    success: { cuit: "30712345678", cert: "synthetic-cert", key: "synthetic-key", ptoVentas: [12] },
  });
  mocks.voucherNumber.mockResolvedValue({ success: 344 });
  mocks.createGrant.mockResolvedValue({ id: "grant-qr-qa" });
  mocks.axiosPost.mockResolvedValue({
    status: 200,
    data: { success: true, data: { CAE: "12345678901234", nroComprobante: 345, ptoVenta: 12, qrData: undefined } },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AFIP authorization to QR grant handoff", () => {
  it("creates a server grant from authorized invoice claims and returns only its opaque token for save", async () => {
    mocks.createGrant.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      expect(data).toMatchObject({
        businessId: ACTOR.businessId,
        cae: "12345678901234",
        billType: "Factura B",
        invoiceNumber: 345,
        pointOfSale: 12,
        fiscalAmount: "2750.00",
        issuerCuit: "30712345678",
        requestDate: new Date("2026-04-09T00:00:00.000Z"),
      });
      return { id: "grant-qr-qa" };
    });
    const result = await issueInvoice();

    expect(result).toMatchObject({ success: true, data: { cae: "12345678901234" } });
    expect(mocks.createGrant).toHaveBeenCalledTimes(1);
    expect(mocks.axiosPost).toHaveBeenCalledTimes(1);
    if ("data" in result) {
      expect(result.data.qrAttestationToken).toMatch(/^[a-f0-9]{64}$/);
      expect(result.data.qrData).toBe("");
      const grantArgs = mocks.createGrant.mock.calls[0]?.[0] as { data?: Record<string, unknown> };
      expect(grantArgs.data?.tokenHash).toBe(createHash("sha256")
        .update(result.data.qrAttestationToken ?? "")
        .digest("hex"));
    }
  });

  it("keeps an authorized CAE saveable when no usable QR proof exists and never reissues", async () => {
    mocks.axiosPost.mockResolvedValue({
      status: 200,
      data: { success: true, data: { CAE: "12345678901234", nroComprobante: 345, ptoVenta: 12 } },
    });
    mocks.createGrant.mockClear();

    const result = await issueInvoice(invoice({ clientDocumentType: "DNI", clientDocumentNumber: "" }));

    expect(result).toMatchObject({ success: true, data: { cae: "12345678901234" } });
    if ("data" in result) expect(result.data.qrAttestationToken).toBeUndefined();
    expect(mocks.createGrant).not.toHaveBeenCalled();
    expect(mocks.axiosPost).toHaveBeenCalledTimes(1);
  });

  it("records grant persistence failure categorically while preserving the authorized CAE", async () => {
    mocks.createGrant.mockRejectedValue(new Error("synthetic private failure: 30712345678 2750"));
    const telemetry = captureConsoleCalls();

    try {
      const result = await issueInvoice();

      expect(result).toMatchObject({ success: true, data: { cae: "12345678901234" } });
      if ("data" in result) expect(result.data.qrAttestationToken).toBeUndefined();
      expect(mocks.axiosPost).toHaveBeenCalledTimes(1);
      expectSafeQrTelemetry(telemetry.calls, {
        stage: "grant-create",
        reason: "grant-create-failed",
      }, ["12345678901234", "30712345678", "2750", "qr-qa-tenant"]);
    } finally {
      telemetry.restore();
    }
  });

  it("categorizes invalid grant claims without logging claim values", async () => {
    const claims = {
      businessId: "qr-qa-tenant",
      cae: "12345678901234",
      billType: "Factura B",
      afipVoucherType: 6,
      invoiceNumber: 345,
      pointOfSale: 12,
      fiscalAmount: "2750.00",
      issuerCuit: "invalid-cuit",
      requestDate: "2026-04-09",
      recipientIvaCondition: "Consumidor Final",
      recipientDocumentType: null,
      recipientDocumentNumber: null,
      payload: {
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
        codAut: 12345678901234,
      },
      rawQrData: "synthetic-private-qr-payload",
    } as const;
    const telemetry = captureConsoleCalls();

    try {
      await expect(createAuthorizedArcaQrGrant(claims)).resolves.toBeNull();
      expect(mocks.createGrant).not.toHaveBeenCalled();
      expectSafeQrTelemetry(telemetry.calls, {
        stage: "grant-create",
        reason: "claims-invalid",
      }, ["12345678901234", "30712345678", "2750", "invalid-cuit", "synthetic-private-qr-payload"]);
    } finally {
      telemetry.restore();
    }
  });

});
