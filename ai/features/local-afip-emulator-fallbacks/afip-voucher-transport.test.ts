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

const LOCAL_CREATE_VOUCHER_URL = "http://127.0.0.1:5001/stockia-e90c6/us-central1/createAFIPVoucher";
const actor = {
  id: "actor-1",
  businessId: "tenant-1",
  role: "ADMIN",
  email: "qa@example.test",
  business: null,
};

function invoice(): BillState {
  return {
    id: "invoice-1",
    seller: "QA",
    typeDocument: "FACTURA",
    billType: "Factura B",
    twoMethods: false,
    secondPaidMethod: "Debito",
    totalSecondMethod: null,
    entrega: 0,
    pago: true,
    paidMethod: "Efectivo",
    clientId: "client-1",
    client: "Consumidor Final",
    clientIvaCondition: "Consumidor Final",
    clientDocumentNumber: "20123456789",
    ptoVenta: 9,
    products: [{ id: "sku-1", code: "SKU-1", description: "Test product", price: 100, salePrice: 100, amount: 1 }],
    total: 100,
    totalWithDiscount: 100,
    discount: 0,
    IVACondition: "Consumidor Final",
    date: new Date("2026-10-01T00:00:00.000Z"),
  } as unknown as BillState;
}

async function prepareAndIssueInvoice(): Promise<void> {
  const prepared = await prepareAfipVoucherForActor(invoice(), actor as never);
  expect(prepared).toHaveProperty("success", true);
  if (!("prepared" in prepared)) throw new Error("Expected AFIP voucher preparation to succeed");

  const issued = await issuePreparedAfipVoucher(prepared.prepared);
  expect(issued).toHaveProperty("success", true);
}

describe("AFIP create-voucher transport URL selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_AFIP_FUNCTION_URL", undefined);
    vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-token");
    vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-key");
    requireFeatureMock.mockResolvedValue({
      success: true,
      data: { ...actor, businessId: "tenant-1", role: "ADMIN" },
    });
    credentialsMock.mockResolvedValue({
      success: { cuit: "20123456789", cert: "encrypted-cert", key: "encrypted-key", ptoVentas: [9] },
    });
    voucherNumberMock.mockResolvedValue({ success: 76 });
    axiosPostMock.mockResolvedValue({
      status: 200,
      data: { success: true, data: { CAE: "98765432101234", nroCbte: 77, ptoVenta: 9 } },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("sends the prepared invoice to the local emulator fallback when the URL is unset", async () => {
    await prepareAndIssueInvoice();

    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(axiosPostMock.mock.calls[0]?.[0]).toBe(LOCAL_CREATE_VOUCHER_URL);
  });

  it("sends the prepared invoice to the exact configured URL override", async () => {
    const overrideUrl = "https://afip-override.example.test/create-voucher?tenant=qa";
    vi.stubEnv("NEXT_PUBLIC_AFIP_FUNCTION_URL", overrideUrl);

    await prepareAndIssueInvoice();

    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(axiosPostMock.mock.calls[0]?.[0]).toBe(overrideUrl);
  });
});
