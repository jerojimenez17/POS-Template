import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureConsoleCalls, expectSafeQrTelemetry } from "../afip-arca-qr-svg-display/qr-telemetry-test-helpers";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findOrder: vi.fn(),
  findGrant: vi.fn(),
  findBusiness: vi.fn(),
  updateOrder: vi.fn(),
  updateOrderMany: vi.fn(),
  updateGrant: vi.fn(),
  updateGrantMany: vi.fn(),
}));

const VALID_PAYLOAD = {
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
};
const VERIFIED_URL = `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(VALID_PAYLOAD))}`;
const HISTORICAL_RAW = "historic-raw-preserved-exactly +/=";

async function loadResolverModule(): Promise<Record<string, unknown> | null> {
  try {
    return await vi.importActual<Record<string, unknown>>(
      "@/lib/server/authorized-arca-qr-grant",
    );
  } catch {
    return null;
  }
}

function getResolver(module: Record<string, unknown> | null):
  ((orderId: string) => Promise<unknown>) | null {
  expect(module, "The tenant-scoped server QR print resolver must exist").not.toBeNull();
  const candidate = module?.resolveOrderQrPrintDto;
  expect(typeof candidate, "resolveOrderQrPrintDto(orderId) must be exported").toBe("function");
  return typeof candidate === "function"
    ? candidate as (orderId: string) => Promise<unknown>
    : null;
}

function mockDbAndAuth() {
  vi.doMock("@/auth", () => ({ auth: mocks.auth }));
  vi.doMock("@/lib/db", () => ({
    db: {
      order: {
        findFirst: mocks.findOrder,
        update: mocks.updateOrder,
        updateMany: mocks.updateOrderMany,
      },
      authorizedArcaQrGrant: {
        findFirst: mocks.findGrant,
        findUnique: mocks.findGrant,
        update: mocks.updateGrant,
        updateMany: mocks.updateGrantMany,
      },
      business: { findUnique: mocks.findBusiness },
    },
  }));
}

beforeEach(() => {
  vi.resetModules();
  mocks.auth.mockReset().mockResolvedValue({ user: { id: "user-a", businessId: "tenant-qr-test-a" } });
  mocks.findOrder.mockReset();
  mocks.findGrant.mockReset();
  mocks.findBusiness.mockReset().mockResolvedValue({ cuit: "30712345678" });
  mocks.updateOrder.mockReset();
  mocks.updateOrderMany.mockReset();
  mocks.updateGrant.mockReset();
  mocks.updateGrantMany.mockReset();
  mockDbAndAuth();
});

describe("server-side, tenant-scoped standard invoice QR print DTO", () => {
  it("rebuilds a verified URL from the bound grant, never from CAE JSON raw/url fields", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-qr-a",
      businessId: "tenant-qr-test-a",
      qrDataPolicyVersion: 1,
      total: 2750,
      CAE: {
        CAE: "12345678901234",
        nroComprobante: 345,
        qrAttestationId: "grant-qr-a",
        qrData: "browser-poison-raw",
        qrUrl: "https://attacker.invalid/qr?p=forged",
        requestDate: "1999-01-01",
      },
    });
    mocks.findGrant.mockResolvedValue({
      id: "grant-qr-a",
      businessId: "tenant-qr-test-a",
      orderId: "order-qr-a",
      cae: "12345678901234",
      issuerCuit: "30712345678",
      invoiceNumber: 345,
      pointOfSale: 12,
      payload: VALID_PAYLOAD,
      rawQrData: "raw-from-this-grant",
      requestDate: "2026-04-09",
    });
    const resolver = getResolver(await loadResolverModule());
    if (!resolver) return;

    const dto = await resolver("order-qr-a");

    expect(dto).toEqual({ qrValue: VERIFIED_URL, qrKind: "verified-url" });
    expect(mocks.findOrder).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-qr-a", businessId: "tenant-qr-test-a" },
    }));
    expect(JSON.stringify(dto)).not.toContain("browser-poison-raw");
    expect(JSON.stringify(dto)).not.toContain("attacker.invalid");
  });

  it("rejects a tenant-correct grant linked to a different order without returning QR or writing", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-qr-a",
      businessId: "tenant-qr-test-a",
      qrDataPolicyVersion: 1,
      total: 2750,
      billType: "Factura B",
      afipVoucherType: 6,
      clientIvaCondition: "Consumidor Final",
      clientDocumentType: null,
      clientDocumentNumber: null,
      CAE: {
        CAE: "12345678901234",
        nroComprobante: 345,
        ptoVenta: 12,
        qrAttestationId: "grant-qr-a",
      },
    });
    mocks.findGrant.mockResolvedValue({
      id: "grant-qr-a",
      businessId: "tenant-qr-test-a",
      orderId: "different-order-qr-a",
      cae: "12345678901234",
      billType: "Factura B",
      afipVoucherType: 6,
      invoiceNumber: 345,
      pointOfSale: 12,
      fiscalAmount: "2750.00",
      issuerCuit: "30712345678",
      requestDate: "2026-04-09",
      recipientIvaCondition: "Consumidor Final",
      recipientDocumentType: null,
      recipientDocumentNumber: null,
      payload: VALID_PAYLOAD,
      rawQrData: "grant-bound-raw-must-not-escape",
    });
    const resolver = getResolver(await loadResolverModule());
    if (!resolver) return;
    const telemetry = captureConsoleCalls();

    try {
      const dto = await resolver("order-qr-a");

      expect.soft(dto).toEqual({ qrValue: null, qrKind: "none" });
      expect.soft(JSON.stringify(dto)).not.toContain("grant-bound-raw-must-not-escape");
      expect.soft(JSON.stringify(dto)).not.toContain("www.afip.gob.ar");
      expect.soft(mocks.updateOrder).not.toHaveBeenCalled();
      expect.soft(mocks.updateOrderMany).not.toHaveBeenCalled();
      expect.soft(mocks.updateGrant).not.toHaveBeenCalled();
      expect.soft(mocks.updateGrantMany).not.toHaveBeenCalled();
      expectSafeQrTelemetry(telemetry.calls, {
        stage: "resolve",
        reason: "invoice-binding-mismatch",
        qrKind: "none",
      }, [
        "order-qr-a",
        "different-order-qr-a",
        "grant-bound-raw-must-not-escape",
        "tenant-qr-test-a",
        "12345678901234",
        "30712345678",
        "2750",
      ]);
    } finally {
      telemetry.restore();
    }
  });

  it("preserves raw QR unchanged only for migrated version 0 with no grant reference", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "legacy-order-qr",
      businessId: "tenant-qr-test-a",
      qrDataPolicyVersion: 0,
      CAE: { CAE: "12345678901234", qrData: HISTORICAL_RAW },
    });
    const resolver = getResolver(await loadResolverModule());
    if (!resolver) return;

    const dto = await resolver("legacy-order-qr");

    expect(dto).toEqual({ qrValue: HISTORICAL_RAW, qrKind: "legacy-raw" });
    expect(mocks.findGrant).not.toHaveBeenCalled();
  });

  it("does not reinterpret historical raw data as verified URL or payload", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "legacy-order-qr",
      businessId: "tenant-qr-test-a",
      qrDataPolicyVersion: 0,
      CAE: { CAE: "12345678901234", qrData: HISTORICAL_RAW },
    });
    const resolver = getResolver(await loadResolverModule());
    if (!resolver) return;

    const dto = await resolver("legacy-order-qr") as Record<string, unknown>;

    expect(dto).toEqual({ qrValue: HISTORICAL_RAW, qrKind: "legacy-raw" });
    expect(dto).not.toHaveProperty("payload");
    expect(dto).not.toHaveProperty("requestDate");
  });

  it("returns no QR for a new policy-version 1 authorization without a grant", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "new-order-without-grant",
      businessId: "tenant-qr-test-a",
      qrDataPolicyVersion: 1,
      CAE: {
        CAE: "12345678901234",
        qrData: "unattested-new-raw",
        qrUrl: "https://attacker.invalid/qr?p=forged",
        requestDate: "2026-04-09",
      },
    });
    mocks.findGrant.mockResolvedValue(null);
    const resolver = getResolver(await loadResolverModule());
    if (!resolver) return;

    await expect(resolver("new-order-without-grant"))
      .resolves.toEqual({ qrValue: null, qrKind: "none" });
    expect(mocks.findGrant).not.toHaveBeenCalled();
  });

  it("uses a valid grant raw fallback only when URL reconstruction is unavailable", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-raw-fallback",
      businessId: "tenant-qr-test-a",
      qrDataPolicyVersion: 1,
      CAE: { CAE: "12345678901234", nroComprobante: 345, qrAttestationId: "grant-raw" },
    });
    mocks.findGrant.mockResolvedValue({
      id: "grant-raw",
      businessId: "tenant-qr-test-a",
      orderId: "order-raw-fallback",
      cae: "12345678901234",
      issuerCuit: "30712345678",
      invoiceNumber: 345,
      payload: null,
      rawQrData: "grant-bound-raw-only",
    });
    const resolver = getResolver(await loadResolverModule());
    if (!resolver) return;

    await expect(resolver("order-raw-fallback"))
      .resolves.toEqual({ qrValue: "grant-bound-raw-only", qrKind: "verified-raw" });
  });

  it.each([
    ["policy-v1-no-ref", "policy-v1-no-ref"],
    ["grant-row-missing", "grant-row-missing"],
    ["issuer-mismatch", "issuer-mismatch"],
    ["payload-invalid", "payload-invalid"],
  ] as const)("reports only the bounded %s resolver reason", async (scenario, reason) => {
    const order = {
      id: "synthetic-order-id",
      businessId: "tenant-qr-test-a",
      qrDataPolicyVersion: 1,
      total: 2750,
      billType: "Factura B",
      afipVoucherType: 6,
      clientIvaCondition: "Consumidor Final",
      clientDocumentType: null,
      clientDocumentNumber: null,
      CAE: { CAE: "12345678901234", nroComprobante: 345, ptoVenta: 12 } as Record<string, unknown>,
    };
    const grant = {
      id: "synthetic-grant-id",
      businessId: "tenant-qr-test-a",
      orderId: "synthetic-order-id",
      cae: "12345678901234",
      billType: "Factura B",
      afipVoucherType: 6,
      invoiceNumber: 345,
      pointOfSale: 12,
      fiscalAmount: "2750.00",
      issuerCuit: "30712345678",
      requestDate: "2026-04-09",
      recipientIvaCondition: "Consumidor Final",
      recipientDocumentType: null,
      recipientDocumentNumber: null,
      payload: VALID_PAYLOAD,
      rawQrData: null,
    };
    if (scenario !== "policy-v1-no-ref") {
      order.CAE = { ...order.CAE, qrAttestationId: "synthetic-grant-id" };
    }
    mocks.findOrder.mockResolvedValue(order);
    if (scenario === "grant-row-missing") mocks.findGrant.mockResolvedValue(null);
    if (scenario === "issuer-mismatch") {
      mocks.findGrant.mockResolvedValue({ ...grant, issuerCuit: "30987654321" });
    }
    if (scenario === "payload-invalid") {
      mocks.findGrant.mockResolvedValue({ ...grant, payload: { ...VALID_PAYLOAD, codAut: 1 } });
    }
    const resolver = getResolver(await loadResolverModule());
    if (!resolver) return;
    const telemetry = captureConsoleCalls();

    try {
      await expect(resolver("synthetic-order-id"))
        .resolves.toEqual({ qrValue: null, qrKind: "none" });
      expectSafeQrTelemetry(telemetry.calls, {
        stage: "resolve",
        reason,
        qrKind: "none",
      }, [
        "synthetic-order-id",
        "synthetic-grant-id",
        "tenant-qr-test-a",
        "12345678901234",
        "30712345678",
        "30987654321",
        "2750",
      ]);
    } finally {
      telemetry.restore();
    }
  });

  it("marks a non-empty verified URL as QR-ready without extending the print DTO", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "synthetic-order-id",
      businessId: "tenant-qr-test-a",
      qrDataPolicyVersion: 1,
      total: 2750,
      billType: "Factura B",
      afipVoucherType: 6,
      clientIvaCondition: "Consumidor Final",
      clientDocumentType: null,
      clientDocumentNumber: null,
      CAE: {
        CAE: "12345678901234",
        nroComprobante: 345,
        ptoVenta: 12,
        qrAttestationId: "synthetic-grant-id",
      },
    });
    mocks.findGrant.mockResolvedValue({
      id: "synthetic-grant-id",
      businessId: "tenant-qr-test-a",
      orderId: "synthetic-order-id",
      cae: "12345678901234",
      billType: "Factura B",
      afipVoucherType: 6,
      invoiceNumber: 345,
      pointOfSale: 12,
      fiscalAmount: "2750.00",
      issuerCuit: "30712345678",
      requestDate: "2026-04-09",
      recipientIvaCondition: "Consumidor Final",
      recipientDocumentType: null,
      recipientDocumentNumber: null,
      payload: VALID_PAYLOAD,
      rawQrData: null,
    });
    const resolver = getResolver(await loadResolverModule());
    if (!resolver) return;
    const telemetry = captureConsoleCalls();

    try {
      const dto = await resolver("synthetic-order-id") as Record<string, unknown>;

      expect(dto).toEqual({ qrValue: VERIFIED_URL, qrKind: "verified-url" });
      expect(dto).not.toHaveProperty("reason");
      expect(dto).not.toHaveProperty("stage");
      expectSafeQrTelemetry(telemetry.calls, {
        stage: "resolve",
        reason: "QR-ready",
        qrKind: "verified-url",
      }, [
        "synthetic-order-id",
        "synthetic-grant-id",
        "tenant-qr-test-a",
        "12345678901234",
        "30712345678",
        "2750",
      ]);
    } finally {
      telemetry.restore();
    }
  });
});
