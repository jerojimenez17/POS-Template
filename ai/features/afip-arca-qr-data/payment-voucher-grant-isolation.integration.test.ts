import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issuePaymentVoucherForSession, printPaymentVoucherForSession } from "@/lib/server/payment-voucher";

const state = vi.hoisted(() => ({
  paymentVoucher: null as Record<string, unknown> | null,
  attempt: null as Record<string, unknown> | null,
  findVoucherCalls: 0,
  grantCreate: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findPayment: vi.fn(),
  requireFeature: vi.fn(),
  getCredentials: vi.fn(),
  getVoucherNumber: vi.fn(),
  axiosPost: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth-gates", () => ({
  requireFeature: mocks.requireFeature,
}));
vi.mock("@/lib/server/arca-billing", () => ({
  getArcaCredentialsForBilling: mocks.getCredentials,
  getVoucherNumberForActor: mocks.getVoucherNumber,
}));
vi.mock("axios", () => ({
  default: {
    post: mocks.axiosPost,
    isAxiosError: vi.fn(() => false),
  },
  post: mocks.axiosPost,
  isAxiosError: vi.fn(() => false),
}));
vi.mock("@/lib/db", () => {
  const matchesStatus = (where: Record<string, unknown>, status: unknown) => {
    const expected = where.status;
    return expected === undefined || expected === status
      || typeof expected === "object" && expected !== null
        && Array.isArray((expected as { in?: unknown[] }).in)
        && (expected as { in: unknown[] }).in.includes(status);
  };
  const db = {
    $transaction: vi.fn(async (callback: (client: Record<string, unknown>) => Promise<unknown>) =>
      callback({ paymentVoucher, paymentVoucherAttempt, authorizedArcaQrGrant: { create: state.grantCreate } })),
    cashMovement: { findFirst: mocks.findPayment },
    business: { findUnique: vi.fn(async () => ({
      id: "partial-tenant-qr",
      accountStatus: "ACTIVE",
      features: { hasAfipBilling: true },
    })) },
    authorizedArcaQrGrant: { create: state.grantCreate },
    paymentVoucher: {
      findUnique: vi.fn(async () => state.paymentVoucher),
      findFirst: vi.fn(async () => {
        state.findVoucherCalls += 1;
        return state.paymentVoucher;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const nested = data.attempts as { create: Record<string, unknown> };
        state.attempt = { ...nested.create, status: "PREPARING", attemptNumber: 1 };
        state.paymentVoucher = {
          ...data,
          id: "partial-voucher-qr-db",
          currentAttempt: 1,
          attempts: [state.attempt],
        };
        return state.paymentVoucher;
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (!state.paymentVoucher || !matchesStatus(where, state.paymentVoucher.status)) return { count: 0 };
        state.paymentVoucher = { ...state.paymentVoucher, ...data };
        return { count: 1 };
      }),
    },
    paymentVoucherAttempt: {
      findFirst: vi.fn(async () => state.attempt),
      updateMany: vi.fn(async ({ where, data }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (!state.attempt || !matchesStatus(where, state.attempt.status)) return { count: 0 };
        state.attempt = { ...state.attempt, ...data };
        if (state.paymentVoucher) state.paymentVoucher = { ...state.paymentVoucher, attempts: [state.attempt] };
        return { count: 1 };
      }),
    },
  };
  const { paymentVoucher, paymentVoucherAttempt } = db;
  return { db };
});

const tenant = "partial-tenant-qr";
const paymentId = "partial-payment-qr";
const requestDate = new Date("2026-04-09T00:00:00.000Z");
const partialRawQr = "raw-qr-from-this-partial-authorization";

function savedPayment() {
  return {
    id: paymentId,
    businessId: tenant,
    total: 2750,
    paidMethod: "Tarjeta",
    order: {
      id: "order-with-unrelated-cae",
      businessId: tenant,
      total: 12000,
      date: requestDate,
      seller: "QA seller",
      client: {
        id: "partial-client-qr",
        name: "Cliente parcial QA",
        ivaCondition: "Consumidor Final",
        fiscalDocumentType: null,
        fiscalDocumentNumber: null,
      },
      invoice: { cae: "98765432109876", billType: "Factura A", invoiceNumber: 808 },
    },
    business: {
      name: "Comercio parcial QA",
      cuit: "30712345678",
      ptoVenta: [12],
      condicionIva: "Responsable Inscripto",
    },
  };
}

beforeEach(() => {
  state.paymentVoucher = null;
  state.attempt = null;
  state.findVoucherCalls = 0;
  vi.clearAllMocks();
  state.grantCreate.mockResolvedValue({ id: "standard-qr-grant-created" });
  mocks.auth.mockResolvedValue({ user: {
    id: "partial-user-qr",
    businessId: tenant,
    role: "ADMIN",
  } });
  mocks.findPayment.mockResolvedValue(savedPayment());
  mocks.requireFeature.mockImplementation(async (_feature: unknown, actor: unknown) => ({
    success: true,
    data: actor,
  }));
  mocks.getCredentials.mockResolvedValue({
    success: {
      cuit: "30712345678",
      cert: "synthetic-cert",
      key: "synthetic-key",
      ptoVentas: [12],
    },
  });
  mocks.getVoucherNumber.mockResolvedValue({ success: 344 });
  mocks.axiosPost.mockResolvedValue({
    status: 200,
    data: {
      CAE: "12345678901234",
      CAEFchVto: "20261231",
      nroCbte: 345,
      ptoVenta: 12,
      qrData: partialRawQr,
      fiscalSnapshot: {
        version: 1,
        source: "AUTHORIZED_VOUCHER",
        billType: "Factura B",
        afipVoucherType: 6,
        issuerIvaCondition: "Responsable Inscripto",
        buyerIvaCondition: "Consumidor Final",
        currency: "ARS",
        total: 2750,
        net: 2750,
        vat: 0,
        nonTaxed: 0,
        exempt: 0,
        otherTaxes: 0,
        iva: [{ id: 5, base: 2750, amount: 0 }],
      },
    },
  });
  vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "synthetic-access-token");
  vi.stubEnv("INTERNAL_AFIP_API_KEY", "synthetic-internal-key");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("real partial-payment issuance keeps QR outside standard grants", () => {
  it("persists and prints the partial voucher QR without creating an AuthorizedArcaQrGrant", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T15:00:00.000Z"));
    const result = await issuePaymentVoucherForSession({
      cashMovementId: paymentId,
      billType: "Factura B",
      ptoVenta: 12,
    });

    expect(result).toMatchObject({ paymentRecorded: true, voucherStatus: "AUTHORIZED" });
    expect(state.paymentVoucher).toMatchObject({
      status: "AUTHORIZED",
      cae: "12345678901234",
      invoiceNumber: 345,
      invoicePointOfSale: 12,
      qrData: partialRawQr,
    });
    expect(state.attempt).toMatchObject({ status: "AUTHORIZED", requestDate });

    const dto = await printPaymentVoucherForSession({ cashMovementId: paymentId });
    expect(dto).toMatchObject({
      status: "AUTHORIZED",
      cae: "12345678901234",
      invoiceNumber: 345,
      pointOfSale: 12,
      requestDate: "2026-04-09",
      qrData: partialRawQr,
    });
    expect(dto.qrUrl).toContain("https://www.afip.gob.ar/fe/qr/?p=");
    const qrPayload = JSON.parse(Buffer.from(new URL(String(dto.qrUrl)).searchParams.get("p")!, "base64").toString("utf8"));
    expect(qrPayload).toMatchObject({
      fecha: "2026-04-09",
      cuit: 30712345678,
      ptoVta: 12,
      tipoCmp: 6,
      nroCmp: 345,
      importe: 2750,
      codAut: 12345678901234,
    });
    expect(JSON.stringify(dto)).not.toContain("98765432109876");
    expect(JSON.stringify(dto)).not.toContain("808");
    expect(mocks.axiosPost).toHaveBeenCalledTimes(1);
    expect(mocks.axiosPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ action: "createVoucher" }),
      expect.any(Object),
    );
    // Soft assertion lets the CAE and partial-voucher print DTO assertions above
    // complete while still making the standard-grant regression an observable RED.
    expect.soft(state.grantCreate).not.toHaveBeenCalled();
  });
});
