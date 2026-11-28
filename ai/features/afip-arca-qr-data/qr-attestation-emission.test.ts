import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prepare: vi.fn(),
  issue: vi.fn(),
  createSnapshotGrant: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/server/afip-voucher", () => ({
  prepareAfipVoucherForActor: mocks.prepare,
  issuePreparedAfipVoucher: mocks.issue,
}));
vi.mock("@/lib/server/fiscal-snapshot-grant", () => ({
  createAuthorizedFiscalSnapshotGrant: mocks.createSnapshotGrant,
}));

import { createAfipVoucherAction } from "@/actions/afip";

const GATEWAY_AUTHORIZATION = {
  success: true,
  data: {
    cae: "12345678901234",
    vencimiento: "20261231",
    nroComprobante: 345,
    ptoVenta: 12,
    qrData: "raw-gateway-data-must-remain-server-side",
    qrUrl: "https://www.afip.gob.ar/fe/qr/?p=untrusted-prebuilt-payload",
    requestDate: "2026-04-09",
    qrAttestationToken: "opaque-server-created-qr-token",
    sourcePath: "direct",
  },
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: {
    id: "user-qr-a",
    businessId: "tenant-qr-test-a",
    role: "ADMIN",
  } });
  mocks.prepare.mockResolvedValue({ prepared: { marker: "prepared" } });
  mocks.issue.mockResolvedValue(GATEWAY_AUTHORIZATION);
  mocks.createSnapshotGrant.mockResolvedValue("fiscal-snapshot-token-not-for-qr");
});

describe("public AFIP voucher action attestation boundary", () => {
  it("returns an opaque QR token only, without exposing raw, URL, payload, or request date", async () => {
    const result = await createAfipVoucherAction({
      id: "invoice-qr-a",
      seller: "Synthetic QA seller",
      typeDocument: "DNI",
      IVACondition: "Consumidor Final",
      twoMethods: false,
      billType: "Factura B",
      discount: 0,
      documentNumber: 0,
      total: 2750,
      totalWithDiscount: 2750,
      date: "2026-04-09T00:00:00.000Z",
      ptoVenta: 12,
      products: [],
    });
    const serialized = JSON.stringify(result);
    const data = "data" in result ? result.data as unknown as Record<string, unknown> : {};

    expect("success" in result).toBe(true);
    expect(data.qrAttestationToken).toBe("opaque-server-created-qr-token");
    expect(data.qrData).toBeUndefined();
    expect(data.qrUrl).toBeUndefined();
    expect(data.payload).toBeUndefined();
    expect(data.requestDate).toBeUndefined();
    expect(data.reason).toBeUndefined();
    expect(data.qrKind).toBeUndefined();
    expect(data.stage).toBeUndefined();
    expect(data.outcome).toBeUndefined();
    expect(data.diagnostics).toBeUndefined();
    expect(serialized).not.toContain(GATEWAY_AUTHORIZATION.data.qrData);
    expect(serialized).not.toContain(GATEWAY_AUTHORIZATION.data.qrUrl);
    expect(serialized).not.toContain(GATEWAY_AUTHORIZATION.data.requestDate);
  });

  it("keeps the CAE successful and returns no QR token when attestation creation is unavailable", async () => {
    mocks.issue.mockResolvedValue({
      ...GATEWAY_AUTHORIZATION,
      data: {
        ...GATEWAY_AUTHORIZATION.data,
        qrData: "raw-gateway-data-must-remain-server-side",
        qrAttestationToken: undefined,
      },
    });

    const result = await createAfipVoucherAction({
      id: "invoice-qr-a",
      seller: "Synthetic QA seller",
      typeDocument: "DNI",
      IVACondition: "Consumidor Final",
      twoMethods: false,
      billType: "Factura B",
      discount: 0,
      documentNumber: 0,
      total: 2750,
      totalWithDiscount: 2750,
      date: "2026-04-09T00:00:00.000Z",
      ptoVenta: 12,
      products: [],
    });

    expect("success" in result).toBe(true);
    if ("success" in result) {
      const data = result.data as unknown as Record<string, unknown>;
      expect(result.data.cae).toBe("12345678901234");
      expect(data.qrAttestationToken).toBeUndefined();
      expect(data.qrData).toBeUndefined();
      expect(data.qrUrl).toBeUndefined();
      expect(data.requestDate).toBeUndefined();
    }
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });
});
