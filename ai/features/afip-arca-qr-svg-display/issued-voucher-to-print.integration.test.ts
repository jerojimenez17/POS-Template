import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareAfipVoucherForActor, issuePreparedAfipVoucher } from "@/lib/server/afip-voucher";
import { processSaleAction } from "@/actions/sales/process";
import { resolveOrderQrPrintDto } from "@/lib/server/authorized-arca-qr-grant";
import { buildPDFHTML } from "@/lib/print/pdf-templates";
import { printThermalReceipt } from "@/lib/print/BrowserPrint";
import { createAfipInvoiceDTO } from "@/utils/billing";
import type BillState from "@/models/BillState";
import { captureConsoleCalls, expectSafeQrTelemetry } from "./qr-telemetry-test-helpers";

const DB = vi.hoisted(() => ({
  grant: null as Record<string, unknown> | null,
  order: null as Record<string, unknown> | null,
  businessCuit: "30712345678",
  issuerCuit: "30712345678",
  createGrant: vi.fn(),
  findGrant: vi.fn(),
  updateGrant: vi.fn(),
  createOrder: vi.fn(),
  findOrder: vi.fn(),
  transaction: vi.fn(),
  auth: vi.fn(),
  requireFeature: vi.fn(),
  credentials: vi.fn(),
  voucherNumber: vi.fn(),
  axiosPost: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: DB.auth }));
vi.mock("axios", () => ({ default: { post: DB.axiosPost, isAxiosError: () => false } }));
vi.mock("@/lib/auth-gates", () => ({ requireFeature: DB.requireFeature }));
vi.mock("@/lib/server/arca-billing", () => ({
  getArcaCredentialsForBilling: DB.credentials,
  getVoucherNumberForActor: DB.voucherNumber,
}));
vi.mock("@/lib/db", () => {
  const business = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === "qr-flow-tenant"
        ? { id: where.id, cuit: DB.businessCuit, features: { hasAfipBilling: true } }
        : null),
  };
  const authorizedArcaQrGrant = {
    create: DB.createGrant,
    findFirst: DB.findGrant,
    findUnique: DB.findGrant,
    updateMany: DB.updateGrant,
  };
  const order = { findFirst: DB.findOrder };
  return {
    db: {
      business,
      authorizedArcaQrGrant,
      order,
      $transaction: DB.transaction,
    },
  };
});
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn() } }));
vi.mock("@/lib/batch-utils", () => ({
  processInBatches: vi.fn(),
  bulkUpdateStock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/server/fiscal-snapshot-grant", () => ({
  consumeAuthorizedFiscalSnapshotGrant: vi.fn().mockResolvedValue(undefined),
}));

const ACTOR = { id: "qr-flow-user", role: "ADMIN", businessId: "qr-flow-tenant", business: null };
const CAE = "12345678901234";
const QR_REQUEST_DATE = "2026-04-09";

function billingModalInvoice(overrides: Partial<BillState> = {}): BillState {
  // BillingModal.handleBilling creates these exact consumer-final values:
  // docType === "", clientDocumentType === undefined, documentNumber === 0,
  // and clientDocumentNumber === "".
  return {
    id: "form-invoice-consumer",
    seller: "Synthetic QA seller",
    typeDocument: "",
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
    paidMethod: "Tarjeta",
    products: [{ id: "product-qr-flow", code: "QR-1", description: "Synthetic item", price: 2750, salePrice: 2750, amount: 1 }],
    ...overrides,
  } as BillState;
}

function billButtonsConsumerFinalFormState(): BillState {
  // BillParametersForm keeps its default clientDocumentType "" in formData,
  // while its onSubmit sets clientDocumentNumber to undefined for an empty field.
  return billingModalInvoice({ clientDocumentType: "", clientDocumentNumber: undefined });
}

function transactionClient() {
  return {
    business: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === ACTOR.businessId ? { cuit: DB.businessCuit } : null),
    },
    cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "qr-flow-session", cashboxId: "qr-flow-box" }) },
    order: {
      create: DB.createOrder,
      findFirst: DB.findOrder,
    },
    authorizedArcaQrGrant: {
      findFirst: DB.findGrant,
      updateMany: DB.updateGrant,
    },
    stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

function receiptData(qrValue: string) {
  return {
    businessName: "Comercio sintético",
    date: new Date("2026-04-09T12:00:00.000Z"),
    documentType: "DNI",
    billType: "Factura B",
    seller: "Synthetic QA seller",
    paidMethod: "Tarjeta",
    products: [{ description: "Synthetic item", amount: 1, unitPrice: 2750, subtotal: 2750 }],
    subtotal: 2750,
    total: 2750,
    invoiceNumber: 345,
    pointOfSale: 12,
    cae: { cae: CAE, vencimiento: "20261231", qrValue },
  };
}

async function issueSaveResolveAndRender(input: BillState) {
  const preparedResult = await prepareAfipVoucherForActor(input, ACTOR as never, QR_REQUEST_DATE);
  expect(preparedResult).toHaveProperty("success", true);
  if (!("prepared" in preparedResult)) throw new Error("Fixture should pass real voucher preparation");

  const issued = await issuePreparedAfipVoucher(preparedResult.prepared);
  expect(issued).toMatchObject({ success: true, data: { cae: CAE } });
  if (!("data" in issued)) throw new Error("Gateway fixture should authorize the voucher");
  const token = issued.data.qrAttestationToken;
  expect(token).toBeTruthy();
  expect(token).toMatch(/^[a-f0-9]{64}$/);

  const result = await processSaleAction({
    total: 2750,
    totalWithDiscount: 2750,
    seller: input.seller,
    paidMethod: "Tarjeta",
    products: input.products.map((product) => ({ ...product })),
    clientIvaCondition: input.clientIvaCondition,
    clientDocumentType: input.clientDocumentType ?? "",
    clientDocumentNumber: input.clientDocumentNumber,
    billType: input.billType,
    CAE: {
      CAE,
      vencimiento: "20261231",
      nroComprobante: 345,
      ptoVenta: 12,
      qrAttestationToken: token,
    },
  } as never);
  expect(result).toEqual({ success: true, orderId: "qr-flow-saved-order" });

  const saved = DB.order as Record<string, unknown>;
  const dto = await resolveOrderQrPrintDto("qr-flow-saved-order");
  expect(dto.qrKind).toBe("verified-url");
  expect(dto.qrValue).toBeTruthy();
  if (!dto.qrValue) throw new Error("Expected verified QR value");

  const svg = await QRCode.toString(dto.qrValue, { type: "svg", margin: 0, width: 60 });
  expect(svg).toContain("<svg");
  expect(svg.length).toBeGreaterThan(0);
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const pdfHtml = buildPDFHTML(receiptData(dto.qrValue), { qrSvgDataUrl: svgDataUrl });
  expect(pdfHtml).toContain('<img src="data:image/svg+xml;base64,');
  expect(pdfHtml).toContain(`CAE:</span> ${CAE}`);

  const write = vi.fn();
  const printWindow = { document: { write, close: vi.fn() }, close: vi.fn() } as unknown as Window;
  vi.stubGlobal("window", { open: vi.fn(() => printWindow) });
  await expect(printThermalReceipt(receiptData(dto.qrValue), false)).resolves.toBe(true);
  const thermalHtml = String(write.mock.calls[0]?.[0]);
  const pngBase64 = thermalHtml.match(/<img src="data:image\/png;base64,([A-Za-z0-9+/]+=*)" alt="QR"\s*\/>/)?.[1];
  expect(pngBase64).toBeTruthy();
  expect([...Buffer.from(pngBase64 ?? "", "base64").subarray(0, 8)])
    .toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(thermalHtml).toContain(CAE);

  return { issued, saved, dto };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "synthetic-access-token");
  vi.stubEnv("INTERNAL_AFIP_API_KEY", "synthetic-internal-key");
  DB.grant = null;
  DB.order = null;
  DB.auth.mockResolvedValue({ user: { id: ACTOR.id, businessId: ACTOR.businessId, role: ACTOR.role } });
  DB.requireFeature.mockResolvedValue({ success: true, data: ACTOR });
  DB.businessCuit = "30712345678";
  DB.issuerCuit = "30712345678";
  DB.credentials.mockImplementation(async () => ({
    success: { cuit: DB.issuerCuit, cert: "synthetic-cert", key: "synthetic-key", ptoVentas: [12] },
  }));
  DB.voucherNumber.mockResolvedValue({ success: 344 });
  DB.axiosPost.mockResolvedValue({
    status: 200,
    data: { success: true, data: { CAE, nroComprobante: 345, ptoVenta: 12 } },
  });
  DB.createGrant.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    DB.grant = { id: "qr-flow-grant", consumedAt: null, orderId: null, ...data };
    return { id: "qr-flow-grant" };
  });
  DB.findGrant.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const grant = DB.grant;
    if (!grant) return null;
    const matches = Object.entries(where).every(([key, value]) => {
      if (key === "expiresAt") return grant.expiresAt instanceof Date && grant.expiresAt > new Date();
      return grant[key] === value;
    });
    return matches ? grant : null;
  });
  DB.updateGrant.mockImplementation(async ({ where, data }: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    if (!DB.grant || DB.grant.id !== where.id) return { count: 0 };
    if ("consumedAt" in where && DB.grant.consumedAt !== where.consumedAt) return { count: 0 };
    if ("orderId" in where && DB.grant.orderId !== where.orderId) return { count: 0 };
    const expiresAt = where.expiresAt as { gt?: Date } | undefined;
    if (expiresAt?.gt && (!(DB.grant.expiresAt instanceof Date)
      || DB.grant.expiresAt.getTime() <= expiresAt.gt.getTime())) return { count: 0 };
    Object.assign(DB.grant, data);
    return { count: 1 };
  });
  DB.createOrder.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    DB.order = { id: "qr-flow-saved-order", businessId: ACTOR.businessId, ...data };
    return { id: "qr-flow-saved-order" };
  });
  DB.findOrder.mockImplementation(async ({ where }: { where: { id: string; businessId: string } }) =>
    DB.order?.id === where.id && DB.order.businessId === where.businessId ? DB.order : null);
  DB.transaction.mockImplementation(async (callback: (tx: ReturnType<typeof transactionClient>) => Promise<unknown>) =>
    callback(transactionClient()));
});

describe("issued voucher → saved grant → tenant resolver → printable QR", () => {
  it("authorizes a BillingModal consumer-final invoice with blank/omitted recipient identifiers", async () => {
    const { issued, saved, dto } = await issueSaveResolveAndRender(billingModalInvoice());

    expect(issued.data.qrAttestationToken).toBeTruthy();
    expect(DB.createGrant).toHaveBeenCalledTimes(1);
    const grantData = DB.createGrant.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(grantData.payload).toMatchObject({
      ver: 1,
      fecha: QR_REQUEST_DATE,
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
      codAut: Number(CAE),
    });
    expect(Object.keys(grantData.payload as object)).toHaveLength(13);
    expect(grantData).toMatchObject({
      businessId: ACTOR.businessId,
      issuerCuit: "30712345678",
      recipientIvaCondition: "Consumidor Final",
      recipientDocumentType: null,
      recipientDocumentNumber: null,
    });
    expect(grantData.tokenHash).toBe(createHash("sha256").update(issued.data.qrAttestationToken!).digest("hex"));
    expect(saved.qrDataPolicyVersion).toBe(1);
    expect(saved.CAE).toMatchObject({ CAE, qrAttestationId: "qr-flow-grant" });
    expect(dto).toMatchObject({ qrKind: "verified-url" });
  });

  it("builds the consumer-final grant when both recipient document fields are absent", async () => {
    const input = billingModalInvoice();
    delete input.clientDocumentType;
    delete input.clientDocumentNumber;
    const { issued, saved, dto } = await issueSaveResolveAndRender(input);

    expect(issued.data.qrAttestationToken).toBeTruthy();
    expect(saved.CAE).toMatchObject({ CAE, qrAttestationId: "qr-flow-grant" });
    expect(dto.qrKind).toBe("verified-url");
    const grantData = DB.createGrant.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(grantData.payload).toMatchObject({ tipoDocRec: 99, nroDocRec: 0 });
    expect(Object.keys(grantData.payload as object)).toHaveLength(13);
    expect(grantData).toMatchObject({ recipientDocumentType: null, recipientDocumentNumber: null });
  });

  it("issues, saves, resolves, and renders with a formatted tenant and issuer CUIT", async () => {
    DB.businessCuit = "30-71234567-8";
    DB.issuerCuit = "30-71234567-8";

    const { issued, saved, dto } = await issueSaveResolveAndRender(billingModalInvoice());

    expect(issued.data.qrAttestationToken).toBeTruthy();
    expect(saved.CAE).toMatchObject({ CAE, qrAttestationId: "qr-flow-grant" });
    expect(dto.qrKind).toBe("verified-url");
    expect(dto.qrValue).toBeTruthy();

    const grantData = DB.createGrant.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(grantData).toMatchObject({
      businessId: ACTOR.businessId,
      issuerCuit: "30712345678",
    });
    expect(grantData.payload).toMatchObject({ cuit: 30712345678 });
    expect(typeof (grantData.payload as Record<string, unknown>).cuit).toBe("number");
    expect(Object.keys(grantData.payload as object)).toHaveLength(13);
  });

  it("observes grant, consume, resolve, and render through bounded server telemetry only", async () => {
    const telemetry = captureConsoleCalls();

    try {
      const { issued, saved, dto } = await issueSaveResolveAndRender(billingModalInvoice());
      const privateValues = [
        "qr-flow-saved-order",
        ACTOR.businessId,
        CAE,
        "30712345678",
        "2750",
        issued.data.qrAttestationToken ?? "missing-synthetic-token",
        dto.qrValue ?? "missing-synthetic-url",
      ];

      expect(saved.qrDataPolicyVersion).toBe(1);
      expect(dto).toMatchObject({ qrKind: "verified-url" });
      expectSafeQrTelemetry(telemetry.calls, { stage: "grant-create" }, privateValues);
      expectSafeQrTelemetry(telemetry.calls, { stage: "save-consume-ref" }, privateValues);
      expectSafeQrTelemetry(telemetry.calls, {
        stage: "resolve",
        reason: "QR-ready",
        qrKind: "verified-url",
      }, privateValues);
      expectSafeQrTelemetry(telemetry.calls, { stage: "render" }, privateValues);
    } finally {
      telemetry.restore();
    }
  });

  it.each([
    ["DNI", "30123456", 96],
    ["CUIT", "30765432109", 80],
  ] as const)("binds an identified %s recipient from the billing form", async (documentType, documentNumber, documentCode) => {
    const input = billingModalInvoice({
      typeDocument: documentType,
      clientDocumentType: documentType,
      clientDocumentNumber: documentNumber,
      documentNumber: Number(documentNumber),
    });
    await issueSaveResolveAndRender(input);

    const grantData = DB.createGrant.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(grantData.payload).toMatchObject({ tipoDocRec: documentCode, nroDocRec: Number(documentNumber) });
    expect(Object.keys(grantData.payload as object)).toHaveLength(13);
    expect(grantData).toMatchObject({ recipientDocumentType: documentType, recipientDocumentNumber: documentNumber });
    expect(DB.updateGrant).toHaveBeenCalledTimes(2);
    expect(DB.updateGrant).toHaveBeenNthCalledWith(2, {
      where: { id: "qr-flow-grant", orderId: null },
      data: { orderId: "qr-flow-saved-order" },
    });
  });

  it("accepts the BillButtons consumer-final form projection before issuing a voucher", async () => {
    const formState = billButtonsConsumerFinalFormState();

    // This is intentionally an acceptance assertion, not a characterization
    // allowance: current behavior is RED because the empty string is rejected.
    const dto = createAfipInvoiceDTO(formState, "Factura B");
    expect(dto.clientDocumentType).toBeUndefined();
    const prepared = await prepareAfipVoucherForActor(dto, ACTOR as never, QR_REQUEST_DATE);
    expect(prepared).toHaveProperty("prepared");
  });
});
