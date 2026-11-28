import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import QRCode from "qrcode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthorizedArcaQrGrant } from "@/lib/server/authorized-arca-qr-grant";
import { processSaleAction } from "@/actions/sales/process";
import { resolveOrderQrPrintDtoAction } from "@/actions/sales/qr-print";
import PrintOptionsPopover from "@/components/Billing/PrintOptionsPopover";
import type BillState from "@/models/BillState";

const state = vi.hoisted(() => ({
  businessId: "tenant-qr-g2",
  issuerCuit: "30712345678",
  grant: null as Record<string, unknown> | null,
  order: null as Record<string, unknown> | null,
  printed: [] as unknown[],
  thermalHtml: "",
  transactionCuitReads: 0,
}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  exportToPDF: vi.fn(),
  qzPrint: vi.fn(),
  qzConnected: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => {
  const matches = (actual: unknown, expected: unknown): boolean => {
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("gt" in expected) return actual instanceof Date
        && actual.getTime() > new Date((expected as { gt: Date }).gt).getTime();
      return actual !== null && typeof actual === "object"
        && Object.entries(expected).every(([key, value]) =>
          matches((actual as Record<string, unknown>)[key], value));
    }
    return actual === expected;
  };
  const match = (row: Record<string, unknown> | null, where: Record<string, unknown>) =>
    Boolean(row && Object.entries(where).every(([key, value]) => matches(row[key], value)));
  const orderCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    state.order = {
      ...data,
      id: "persisted-g2-order",
      qrDataPolicyVersion: 1,
    };
    return { id: "persisted-g2-order" };
  });
  const grantCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    state.grant = { ...data, id: "persisted-g2-grant", consumedAt: null, orderId: null };
    return { id: "persisted-g2-grant" };
  });
  const businessFindUnique = vi.fn(async ({ where }: { where: { id: string } }) =>
    where.id === state.businessId ? { cuit: state.issuerCuit } : null);
  const transactionBusinessFindUnique = vi.fn(async (args: { where: { id: string } }) => {
    state.transactionCuitReads += 1;
    return businessFindUnique(args);
  });
  const grantFindFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
    match(state.grant, where) ? state.grant : null);
  const grantUpdateMany = vi.fn(async ({ where, data }: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    if (!match(state.grant, where)) return { count: 0 };
    state.grant = { ...state.grant, ...data };
    return { count: 1 };
  });
  const orderFindFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
    match(state.order, where) ? state.order : null);
  const tx = {
    business: { findUnique: transactionBusinessFindUnique },
    authorizedArcaQrGrant: { findFirst: grantFindFirst, updateMany: grantUpdateMany },
    cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "session-g2", cashboxId: "cashbox-g2" }) },
    order: { create: orderCreate, findFirst: orderFindFirst, update: vi.fn() },
    orderUpdate: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  return {
    db: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      authorizedArcaQrGrant: { create: grantCreate, findFirst: grantFindFirst },
      business: { findUnique: businessFindUnique },
      order: { findFirst: orderFindFirst },
      cashMovement: { findFirst: vi.fn() },
      paymentVoucher: { findFirst: vi.fn() },
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
vi.mock("@/lib/server/fiscal-snapshot-grant", () => ({ consumeAuthorizedFiscalSnapshotGrant: vi.fn() }));
vi.mock("@/lib/print", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/print")>();
  return { ...actual, exportToPDF: mocks.exportToPDF };
});
vi.mock("qz-tray", () => ({
  default: {
    websocket: { isActive: mocks.qzConnected, connect: vi.fn().mockResolvedValue(undefined) },
    printers: { getDefault: vi.fn().mockResolvedValue("QA thermal printer") },
    configs: { create: vi.fn(() => ({ printer: "QA thermal printer" })) },
    print: mocks.qzPrint,
  },
}));
vi.mock("@/actions/business", () => ({
  getBusinessBillingInfoAction: vi.fn().mockResolvedValue({
    razonSocial: "Comercio de prueba",
    cuit: "30712345678",
    condicionIva: "Responsable Inscripto",
  }),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    <button type="button" onClick={onClick}>{children}</button>,
}));

const payload = {
  ver: 1 as const,
  fecha: "2026-04-09",
  cuit: 30712345678,
  ptoVta: 12,
  tipoCmp: 6,
  nroCmp: 345,
  importe: 2750,
  moneda: "PES" as const,
  ctz: 1 as const,
  tipoDocRec: 99 as const,
  nroDocRec: 0,
  tipoCodAut: "E" as const,
  codAut: 12345678901234,
};
const grantClaims = {
  businessId: "tenant-qr-g2",
  cae: "12345678901234",
  billType: "Factura B" as const,
  afipVoucherType: 6 as const,
  invoiceNumber: 345,
  pointOfSale: 12,
  fiscalAmount: "2750.00",
  issuerCuit: "30712345678",
  requestDate: "2026-04-09",
  recipientIvaCondition: "Consumidor Final",
  recipientDocumentType: null,
  recipientDocumentNumber: null,
  payload,
  rawQrData: "raw-gateway-value-bound-to-grant",
};

function persistedSale(id = "persisted-g2-order"): BillState {
  return {
    id,
    date: new Date("2026-04-09T12:00:00.000Z"),
    products: [],
    total: 2750,
    totalWithDiscount: 2750,
    discount: 0,
    seller: "QA seller",
    billType: "Factura B",
    ptoVenta: 12,
    CAE: { CAE: "12345678901234", vencimiento: "20261231", nroComprobante: 345, ptoVenta: 12 },
  } as unknown as BillState;
}

function renderPrintOptions(sale = persistedSale(), qzTrayEnabled = true) {
  return render(<PrintOptionsPopover sale={sale} session={null} qzTrayEnabled={qzTrayEnabled} />);
}

function decodeSvgDataUrl(src: string): string {
  return Buffer.from(src.replace(/^data:image\/svg\+xml;base64,/, ""), "base64").toString("utf8");
}

beforeEach(() => {
  state.businessId = "tenant-qr-g2";
  state.issuerCuit = "30712345678";
  state.grant = null;
  state.order = null;
  state.printed = [];
  state.thermalHtml = "";
  state.transactionCuitReads = 0;
  vi.clearAllMocks();
  vi.spyOn(QRCode, "toDataURL");
  vi.spyOn(QRCode, "toString");
  mocks.auth.mockResolvedValue({ user: { id: "user-g2", businessId: "tenant-qr-g2", role: "ADMIN" } });
  mocks.qzConnected.mockReturnValue(true);
  mocks.exportToPDF.mockImplementation(async (element: HTMLElement) => {
    state.printed.push(element.innerHTML);
    return true;
  });
  mocks.qzPrint.mockImplementation(async (_config: unknown, data: unknown[]) => {
    state.printed.push(data);
    return true;
  });
  vi.spyOn(window, "open").mockReturnValue({
    document: {
      write: vi.fn((html: string) => { state.thermalHtml = html; }),
      close: vi.fn(),
    },
    close: vi.fn(),
  } as unknown as Window);
});

describe("persisted standard CAE QR end-to-end G2 evidence", () => {
  it("creates a bound grant, consumes its token while saving, and resolves by persisted orderId through the server action", async () => {
    const issuedGrant = await createAuthorizedArcaQrGrant(grantClaims);
    expect(issuedGrant).toMatchObject({ id: "persisted-g2-grant" });
    expect(issuedGrant?.token).toMatch(/^[a-f0-9]{64}$/);

    const saved = await processSaleAction({
      total: 2750,
      totalWithDiscount: 2750,
      seller: "QA seller",
      paidMethod: "Tarjeta",
      products: [],
      clientIvaCondition: "Consumidor Final",
      clientDocumentType: "",
      clientDocumentNumber: "",
      billType: "Factura B",
      CAE: {
        CAE: grantClaims.cae,
        vencimiento: "20261231",
        nroComprobante: 345,
        ptoVenta: 12,
        qrAttestationToken: issuedGrant!.token,
      },
    } as never);

    expect(saved).toEqual({ success: true, orderId: "persisted-g2-order" });
    if (!("orderId" in saved) || typeof saved.orderId !== "string") throw new Error("sale did not return persisted order id");
    expect(state.order?.qrDataPolicyVersion).toBe(1);
    expect(state.order?.CAE).toMatchObject({ CAE: grantClaims.cae, qrAttestationId: issuedGrant?.id });
    expect(state.grant?.consumedAt).toBeInstanceOf(Date);
    expect(state.transactionCuitReads).toBe(1);

    const dto = await resolveOrderQrPrintDtoAction(saved.orderId);
    expect(dto).toMatchObject({ qrKind: "verified-url" });
    expect(dto.qrValue).toBeTruthy();
    const resolvedUrl = new URL(dto.qrValue!);
    expect(resolvedUrl.origin + resolvedUrl.pathname).toBe("https://www.afip.gob.ar/fe/qr/");
    expect(JSON.parse(Buffer.from(resolvedUrl.searchParams.get("p")!, "base64").toString("utf8"))).toEqual(payload);

    const immediatePrint = renderPrintOptions();
    fireEvent.click(screen.getByRole("button", { name: /Generar PDF/i }));
    await waitFor(() => expect(mocks.exportToPDF).toHaveBeenCalledTimes(1));
    const html = state.printed[0] as string;
    const qrImages = html.match(/<img\b[^>]*alt="QR"/gi) ?? [];
    expect(qrImages).toHaveLength(1);
    expect(QRCode.toString).toHaveBeenCalledWith(dto.qrValue, expect.any(Object));
    expect(html).toContain(grantClaims.cae);
    expect(html).toContain("345");
    const src = html.match(/<img\b[^>]*alt="QR"[^>]*>/i)?.[0].match(/\bsrc="([^"]+)"/i)?.[1];
    expect(src).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(decodeSvgDataUrl(src!)).toMatch(/<(?:path|rect)\b/i);
    immediatePrint.unmount();

    state.printed = [];
    renderPrintOptions();
    fireEvent.click(screen.getByRole("button", { name: /Impresión Térmica/i }));
    await waitFor(() => expect(mocks.qzPrint).toHaveBeenCalledTimes(1));
    const qzData = state.printed[0] as unknown[];
    const qzImage = qzData.find((entry) => typeof entry === "object" && entry !== null && "format" in entry) as
      { format: string; flavor: string; data: string } | undefined;
    expect(qzImage).toMatchObject({ format: "image", flavor: "base64" });
    expect(qzImage?.data.length).toBeGreaterThan(100);
    expect(Buffer.from(qzImage!.data, "base64").subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });

  it("fails closed when Business.cuit differs even though a token and all other sale fields match", async () => {
    const issuedGrant = await createAuthorizedArcaQrGrant(grantClaims);
    state.issuerCuit = "30111111119";

    const saved = await processSaleAction({
      total: 2750, seller: "QA seller", paidMethod: "Tarjeta", products: [],
      clientIvaCondition: "Consumidor Final", clientDocumentType: "", clientDocumentNumber: "",
      billType: "Factura B",
      CAE: { CAE: grantClaims.cae, vencimiento: "20261231", nroComprobante: 345, ptoVenta: 12,
        qrAttestationToken: issuedGrant!.token },
    } as never);

    expect(saved).toMatchObject({ success: true, orderId: "persisted-g2-order" });
    if (!("orderId" in saved) || typeof saved.orderId !== "string") throw new Error("sale did not return persisted order id");
    expect(state.order?.CAE).not.toHaveProperty("qrAttestationId");
    expect(state.grant?.consumedAt).toBeNull();
    await expect(resolveOrderQrPrintDtoAction(saved.orderId)).resolves.toEqual({ qrValue: null, qrKind: "none" });
  });

  it.each(["qr-g2-pdf", "qr-g2-thermal"]) (
    "historical print resolves the actual tenant-bound action DTO and creates a real QR for %s",
    async (mode) => {
      const issuedGrant = await createAuthorizedArcaQrGrant(grantClaims);
      if (state.grant) state.grant.orderId = "persisted-g2-order";
      state.order = {
        id: "persisted-g2-order", businessId: state.businessId, total: 2750, billType: "Factura B",
        afipVoucherType: 6, invoiceNumber: 345, invoicePointOfSale: 12,
        clientIvaCondition: "Consumidor Final", clientDocumentType: null, clientDocumentNumber: null,
        qrDataPolicyVersion: 1,
        CAE: { CAE: grantClaims.cae, nroComprobante: 345, ptoVenta: 12, qrAttestationId: issuedGrant!.id },
      };
      const dto = await resolveOrderQrPrintDtoAction("persisted-g2-order");
      expect(dto.qrKind).toBe("verified-url");
      expect(dto.qrValue).toBeTruthy();
      renderPrintOptions();
      if (mode === "qr-g2-pdf") {
        fireEvent.click(screen.getByRole("button", { name: /Generar PDF/i }));
        await waitFor(() => expect(mocks.exportToPDF).toHaveBeenCalledTimes(1));
        const html = state.printed[0] as string;
        const image = html.match(/<img\b[^>]*alt="QR"[^>]*>/i)?.[0];
        const imageSrc = image?.match(/\bsrc="([^"]+)"/i)?.[1];
        expect(imageSrc).toMatch(/^data:image\/svg\+xml;base64,/);
        const svg = decodeSvgDataUrl(imageSrc!);
        expect(svg).toMatch(/<svg[\s>]/i);
        expect(svg).toMatch(/<(?:path|rect)\b/i);
        expect(QRCode.toString).toHaveBeenCalledWith(dto.qrValue, expect.any(Object));
      } else {
        fireEvent.click(screen.getByRole("button", { name: /Impresión Térmica/i }));
        await waitFor(() => expect(mocks.qzPrint).toHaveBeenCalledTimes(1));
        const data = state.printed[0] as Array<unknown>;
        const attachment = data.find((entry) => typeof entry === "object" && entry !== null
          && "format" in entry && (entry as { format: string }).format === "image") as
          { type: string; format: string; flavor: string; data: string } | undefined;
        expect(attachment).toMatchObject({ type: "raw", format: "image", flavor: "base64" });
        expect(attachment?.data.length).toBeGreaterThan(100);
        expect(Buffer.from(attachment!.data, "base64").subarray(0, 8)).toEqual(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        );
      }
    },
  );

  it("puts a real generated QR image in the thermal HTML fallback after historical action resolution", async () => {
    const issuedGrant = await createAuthorizedArcaQrGrant(grantClaims);
    if (state.grant) state.grant.orderId = "persisted-g2-order";
    state.order = {
      id: "persisted-g2-order", businessId: state.businessId, total: 2750, billType: "Factura B",
      afipVoucherType: 6, invoiceNumber: 345, invoicePointOfSale: 12,
      clientIvaCondition: "Consumidor Final", clientDocumentType: null, clientDocumentNumber: null,
      qrDataPolicyVersion: 1,
      CAE: { CAE: grantClaims.cae, nroComprobante: 345, ptoVenta: 12, qrAttestationId: issuedGrant!.id },
    };
    renderPrintOptions(persistedSale(), false);
    fireEvent.click(screen.getByRole("button", { name: /Impresión Térmica/i }));

    await waitFor(() => expect(state.thermalHtml).toContain('alt="QR"'));
    expect(state.thermalHtml).toContain(grantClaims.cae);
    const src = state.thermalHtml.match(/<img\b[^>]*alt="QR"[^>]*>/i)?.[0].match(/\bsrc="([^"]+)"/i)?.[1];
    expect(src).toMatch(/^data:image\/png;base64,/);
    const imageBytes = Buffer.from(src!.split(",")[1], "base64");
    expect(imageBytes.length).toBeGreaterThan(100);
    expect(imageBytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  it("prints the CAE and completes PDF/thermal output without emitting an image for a none DTO", async () => {
    state.order = {
      id: "persisted-g2-order", businessId: state.businessId, total: 2750, billType: "Factura B",
      invoiceNumber: 345, invoicePointOfSale: 12, qrDataPolicyVersion: 1,
      CAE: { CAE: grantClaims.cae, nroComprobante: 345, ptoVenta: 12,
        qrData: "untrusted-client-raw", qrUrl: "https://attacker.invalid/qr?p=bad" },
    };
    const noneDto = await resolveOrderQrPrintDtoAction("persisted-g2-order");
    expect(noneDto).toEqual({ qrValue: null, qrKind: "none" });

    const { unmount } = renderPrintOptions();
    fireEvent.click(screen.getByRole("button", { name: /Generar PDF/i }));
    await waitFor(() => expect(mocks.exportToPDF).toHaveBeenCalledTimes(1));
    expect(state.printed[0]).toContain(grantClaims.cae);
    expect(state.printed[0]).not.toMatch(/<img[^>]+alt="QR"/i);
    unmount();

    state.printed = [];
    mocks.qzPrint.mockClear();
    renderPrintOptions();
    fireEvent.click(screen.getByRole("button", { name: /Impresión Térmica/i }));
    await waitFor(() => expect(mocks.qzPrint).toHaveBeenCalledTimes(1));
    const data = state.printed[0] as unknown[];
    expect(data.some((entry) => typeof entry === "object" && entry !== null && "format" in entry)).toBe(false);
    expect(data[0]).toContain(grantClaims.cae);
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
  });
});
