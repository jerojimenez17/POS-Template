import { Prisma } from "@prisma/client";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrintOptionsPopover from "@/components/Billing/PrintOptionsPopover";
import * as qrPrintActions from "@/actions/sales/qr-print";
import type BillState from "@/models/BillState";

const TENANT_ID = "qr-print-repair-tenant";
const ORDER_ID = "qr-print-repair-order";
const GRANT_ID = "qr-print-repair-orphan";
const CAE = "12345678901234";
const PAYLOAD = {
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
  codAut: Number(CAE),
};

const DB = vi.hoisted(() => ({
  auth: vi.fn(),
  findOrder: vi.fn(),
  findOrderInTransaction: vi.fn(),
  findGrant: vi.fn(),
  findCandidates: vi.fn(),
  linkGrant: vi.fn(),
  updateOrder: vi.fn(),
  findBusiness: vi.fn(),
  transaction: vi.fn(),
  order: null as Record<string, unknown> | null,
  grant: null as Record<string, unknown> | null,
  candidateRows: [] as Record<string, unknown>[],
  events: [] as string[],
  pdfHtml: "",
  exportToPDF: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: DB.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    business: { findUnique: DB.findBusiness },
    order: { findFirst: DB.findOrder },
    authorizedArcaQrGrant: { findFirst: DB.findGrant },
    $transaction: DB.transaction,
  },
}));
vi.mock("@/lib/server/qr-telemetry", () => ({ logQrTelemetry: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/print", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/print")>();
  return {
    ...actual,
    exportToPDF: DB.exportToPDF,
  };
});

function makeOrder(): Record<string, unknown> {
  return {
    id: ORDER_ID,
    businessId: TENANT_ID,
    total: new Prisma.Decimal("2750.00"),
    qrDataPolicyVersion: 1,
    billType: "Factura B",
    afipVoucherType: 6,
    invoiceNumber: 345,
    invoicePointOfSale: 12,
    clientIvaCondition: "Consumidor Final",
    clientDocumentType: null,
    clientDocumentNumber: null,
    CAE: { CAE, nroComprobante: 345, ptoVenta: 12 },
  };
}

function makeOrphan(): Record<string, unknown> {
  return {
    id: GRANT_ID,
    businessId: TENANT_ID,
    cae: CAE,
    billType: "Factura B",
    afipVoucherType: 6,
    invoiceNumber: 345,
    pointOfSale: 12,
    fiscalAmount: new Prisma.Decimal("2750.00"),
    issuerCuit: "30712345678",
    requestDate: new Date("2026-04-09T00:00:00.000Z"),
    recipientIvaCondition: "Consumidor Final",
    recipientDocumentType: null,
    recipientDocumentNumber: null,
    payload: PAYLOAD,
    rawQrData: null,
    consumedAt: new Date("2026-04-09T12:00:00.000Z"),
    orderId: null,
  };
}

function makeSale(): BillState {
  return {
    id: ORDER_ID,
    billType: "Factura B",
    date: new Date("2026-04-09T12:00:00.000Z"),
    seller: "QA seller",
    paidMethod: "Tarjeta",
    clientIvaCondition: "Consumidor Final",
    clientDocumentType: "",
    clientDocumentNumber: "",
    products: [{ id: "qr-print-item", description: "Synthetic item", amount: 1, salePrice: 2750 }],
    total: 2750,
    totalWithDiscount: 2750,
    discount: 0,
    ptoVenta: 12,
    CAE: { CAE, vencimiento: "20261231", nroComprobante: 345, ptoVenta: 12 },
  } as unknown as BillState;
}

function makePrintWindow() {
  const write = vi.fn();
  const popup = {
    document: { write, close: vi.fn() },
    close: vi.fn(),
  } as unknown as Window;
  return { popup, write };
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "consumedAt" && typeof expected === "object" && expected !== null) {
      return row.consumedAt !== null;
    }
    if (key === "fiscalAmount" && row[key] !== null && expected !== null) {
      try {
        return new Prisma.Decimal(String(row[key])).equals(new Prisma.Decimal(String(expected)));
      } catch {
        return false;
      }
    }
    return row[key] === expected;
  });
}

function configureStatefulDatabase(): void {
  const transactionClient = {
    order: {
      findFirst: DB.findOrderInTransaction,
      update: DB.updateOrder,
    },
    authorizedArcaQrGrant: {
      findMany: DB.findCandidates,
      updateMany: DB.linkGrant,
    },
    business: { findUnique: DB.findBusiness },
  };

  DB.findOrder.mockImplementation(async ({ where }: { where: { id: string; businessId: string } }) =>
    DB.order?.id === where.id && DB.order.businessId === where.businessId ? DB.order : null);
  DB.findOrderInTransaction.mockImplementation(async ({ where }: { where: { id: string; businessId: string } }) => {
    DB.events.push("order:read-in-transaction");
    return DB.order?.id === where.id && DB.order.businessId === where.businessId ? DB.order : null;
  });
  DB.findGrant.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    DB.grant && matchesWhere(DB.grant, where) ? DB.grant : null);
  DB.findCandidates.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    DB.events.push("grant:candidates");
    return DB.candidateRows.filter((candidate) => matchesWhere(candidate, where));
  });
  DB.linkGrant.mockImplementation(async ({ where, data }: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    DB.events.push("grant:compare-and-set");
    if (!DB.grant || !matchesWhere(DB.grant, where)) return { count: 0 };
    Object.assign(DB.grant, data);
    return { count: 1 };
  });
  DB.updateOrder.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    DB.events.push("order:write-cae-reference");
    if (DB.order) DB.order = { ...DB.order, ...data };
    return DB.order;
  });
  DB.findBusiness.mockResolvedValue({
    id: TENANT_ID,
    cuit: "30-71234567-8",
    razonSocial: "Comercio QA",
    condicionIva: "Responsable Inscripto",
    address: "Dirección sintética",
  });
  DB.transaction.mockImplementation(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => {
    DB.events.push("transaction:start");
    const result = await callback(transactionClient);
    DB.events.push("transaction:commit");
    return result;
  });
  DB.exportToPDF.mockImplementation(async (element: HTMLElement) => {
    DB.pdfHtml = element.innerHTML;
    return true;
  });
}

async function choosePrintOption(label: "Generar PDF" | "Impresión Térmica"): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button"));
  await user.click(await screen.findByRole("menuitem", { name: label }));
}

beforeEach(() => {
  vi.clearAllMocks();
  DB.order = makeOrder();
  DB.grant = makeOrphan();
  DB.candidateRows = [DB.grant];
  DB.events = [];
  DB.pdfHtml = "";
  DB.auth.mockResolvedValue({ user: { id: "qa-user", businessId: TENANT_ID } });
  configureStatefulDatabase();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("reprint UI → explicit orphan repair → verified QR output", () => {
  it("repairs one consumed orphan from the PDF request and exports the same order with generated SVG and CAE", async () => {
    const { popup } = makePrintWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const repairAction = vi.spyOn(qrPrintActions, "repairOrphanedQrGrantAction");
    const resolverAction = vi.spyOn(qrPrintActions, "resolveOrderQrPrintDtoAction");
    render(<PrintOptionsPopover sale={makeSale()} session={null} />);

    await choosePrintOption("Generar PDF");

    await waitFor(() => expect(DB.exportToPDF).toHaveBeenCalledTimes(1));
    expect(repairAction).toHaveBeenCalledTimes(1);
    expect(repairAction).toHaveBeenCalledWith(ORDER_ID);
    expect(resolverAction).toHaveBeenCalledTimes(2);
    expect(resolverAction).toHaveBeenNthCalledWith(1, ORDER_ID);
    expect(resolverAction).toHaveBeenNthCalledWith(2, ORDER_ID);
    await expect(resolverAction.mock.results[1]?.value).resolves.toMatchObject({
      qrKind: "verified-url",
      qrValue: expect.any(String),
    });
    expect(DB.transaction).toHaveBeenCalledTimes(1);
    expect(DB.events).toEqual([
      "transaction:start",
      "order:read-in-transaction",
      "grant:candidates",
      "grant:compare-and-set",
      "order:write-cae-reference",
      "transaction:commit",
    ]);
    expect(DB.findOrder).toHaveBeenCalledTimes(2);
    expect(DB.findOrder).toHaveBeenNthCalledWith(1, { where: { id: ORDER_ID, businessId: TENANT_ID } });
    expect(DB.findOrder).toHaveBeenNthCalledWith(2, { where: { id: ORDER_ID, businessId: TENANT_ID } });
    expect(DB.findCandidates).toHaveBeenCalledTimes(1);
    expect(DB.grant).toMatchObject({ id: GRANT_ID, consumedAt: expect.any(Date), orderId: ORDER_ID });
    expect(DB.order?.CAE).toMatchObject({ CAE, qrAttestationId: GRANT_ID });
    expect(DB.pdfHtml).toContain('<img src="data:image/svg+xml;base64,');
    expect(DB.pdfHtml).toContain(CAE);
    expect(DB.pdfHtml).toContain("QR");
  });

  it("repairs once for thermal printing and hands off a real PNG QR while retaining CAE", async () => {
    const { popup, write } = makePrintWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const repairAction = vi.spyOn(qrPrintActions, "repairOrphanedQrGrantAction");
    const resolverAction = vi.spyOn(qrPrintActions, "resolveOrderQrPrintDtoAction");
    render(<PrintOptionsPopover sale={makeSale()} session={null} />);

    await choosePrintOption("Impresión Térmica");

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const thermalHtml = String(write.mock.calls[0]?.[0]);
    const pngData = thermalHtml.match(/<img src="data:image\/png;base64,([A-Za-z0-9+/]+=*)" alt="QR"\s*\/>/)?.[1];

    expect(repairAction).toHaveBeenCalledTimes(1);
    expect(repairAction).toHaveBeenCalledWith(ORDER_ID);
    expect(resolverAction).toHaveBeenCalledTimes(2);
    expect(resolverAction).toHaveBeenNthCalledWith(1, ORDER_ID);
    expect(resolverAction).toHaveBeenNthCalledWith(2, ORDER_ID);
    await expect(resolverAction.mock.results[1]?.value).resolves.toMatchObject({
      qrKind: "verified-url",
      qrValue: expect.any(String),
    });
    expect(DB.transaction).toHaveBeenCalledTimes(1);
    expect(DB.findCandidates).toHaveBeenCalledTimes(1);
    expect(DB.grant?.orderId).toBe(ORDER_ID);
    expect(DB.order?.CAE).toMatchObject({ CAE, qrAttestationId: GRANT_ID });
    expect(pngData).toBeTruthy();
    expect([...Buffer.from(pngData ?? "", "base64").subarray(0, 8)])
      .toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(thermalHtml).toContain(CAE);
  });

  it.each([
    ["Generar PDF", "pdf"],
    ["Impresión Térmica", "thermal"],
  ] as const)("exports %s with CAE but no QR when repair finds no grant", async (label, output) => {
    const { popup, write } = makePrintWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const repairAction = vi.spyOn(qrPrintActions, "repairOrphanedQrGrantAction");
    const resolverAction = vi.spyOn(qrPrintActions, "resolveOrderQrPrintDtoAction");
    DB.grant = null;
    DB.candidateRows = [];
    render(<PrintOptionsPopover sale={makeSale()} session={null} />);

    await choosePrintOption(label);

    if (output === "pdf") {
      await waitFor(() => expect(DB.exportToPDF).toHaveBeenCalledTimes(1));
      expect(DB.pdfHtml).toContain(CAE);
      expect(DB.pdfHtml).not.toContain("data:image/svg+xml");
      expect(DB.pdfHtml).not.toContain('alt="QR"');
    } else {
      await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
      const thermalHtml = String(write.mock.calls[0]?.[0]);
      expect(thermalHtml).toContain(CAE);
      expect(thermalHtml).not.toContain('alt="QR"');
      expect(thermalHtml).not.toContain("data:image/png");
    }

    expect(repairAction).toHaveBeenCalledTimes(1);
    expect(repairAction).toHaveBeenCalledWith(ORDER_ID);
    expect(resolverAction).toHaveBeenCalledTimes(2);
    expect(resolverAction).toHaveBeenNthCalledWith(1, ORDER_ID);
    expect(resolverAction).toHaveBeenNthCalledWith(2, ORDER_ID);
    await expect(resolverAction.mock.results[1]?.value).resolves.toEqual({
      qrValue: null,
      qrKind: "none",
    });
    expect(DB.transaction).toHaveBeenCalledTimes(1);
    expect(DB.findCandidates).toHaveBeenCalledTimes(1);
    expect(DB.order?.CAE).not.toHaveProperty("qrAttestationId");
    expect(DB.grant).toBeNull();
  });
});
