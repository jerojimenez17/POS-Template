import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    $transaction: vi.fn(),
    cashboxSession: { findFirst: vi.fn() },
    order: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
    },
    // Merged design tracks fiscal type via OrderUpdate history (Order has no
    // billType column) and gates DEMO-plan sales via DailyUsage counters.
    orderUpdate: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    dailyUsage: { findUnique: vi.fn(), upsert: vi.fn() },
    business: { findUnique: vi.fn() },
    planDefinition: { findUnique: vi.fn() },
    stockMovement: { createMany: vi.fn(), create: vi.fn() },
    product: { update: vi.fn() },
    productRanking: { upsert: vi.fn() },
    cashBox: { update: vi.fn() },
    cashMovement: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-1", role: "ADMIN" } }),
}));
vi.mock("next/server", () => ({ after: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn() } }));
vi.mock("@/lib/batch-utils", () => ({
  bulkUpdateStock: vi.fn().mockResolvedValue(undefined),
  processInBatches: vi.fn().mockResolvedValue(undefined),
}));

import { processSaleAction } from "../../../src/actions/sales/process";
import { updateOrderCaeAction } from "../../../src/actions/sales/update";
import { getSaleByIdAction, getSalesAction } from "../../../src/actions/sales/history";
import { getBillTypeDisplay } from "../../../src/lib/utils/bill-type";
import { buildPDFHTML, PDF_STYLES } from "../../../src/lib/print/pdf-templates";

const cae = {
  CAE: "12345678901234",
  vencimiento: "31/12/2026",
  nroComprobante: 12,
  ptoVenta: 3,
  qrData: "https://example.test/qr",
};

const product = {
  id: "product-1",
  code: "P-1",
  description: "Producto de prueba",
  salePrice: 100,
  amount: 1,
};

function historicalOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    total: 100,
    discountAmount: 0,
    discountPercentage: 0,
    seller: "seller@test",
    date: new Date("2026-08-20T12:00:00Z"),
    clientId: null,
    client: null,
    clientIvaCondition: "Consumidor Final",
    clientDocumentNumber: null,
    paymentMethod: "Efectivo",
    paymentMethod2: null,
    totalMethod2: null,
    CAE: cae,
    billType: "Factura B",
    items: [{ ...product, productId: product.id, costPrice: 80, price: 100, quantity: 1, subTotal: 100 }],
    ...overrides,
  };
}

describe("improve-pdf: billType persistence and historical mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
    dbMock.cashboxSession.findFirst.mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" });
    dbMock.order.create.mockResolvedValue({ id: "order-1" });
    dbMock.order.update.mockResolvedValue({ id: "order-1" });
    dbMock.order.findUniqueOrThrow.mockResolvedValue({
      id: "order-1",
      clientIvaCondition: "Consumidor Final",
      clientDocumentNumber: null,
      paymentMethod: "Efectivo",
      paymentMethod2: null,
      discountPercentage: 0,
    });
    dbMock.order.findFirst.mockResolvedValue({ total: 100, fiscalSnapshot: null });
    dbMock.orderUpdate.findFirst.mockResolvedValue(null);
    dbMock.orderUpdate.findMany.mockResolvedValue([]);
    dbMock.orderUpdate.create.mockResolvedValue({ id: "order-update-1" });
    dbMock.dailyUsage.findUnique.mockResolvedValue(null);
    dbMock.dailyUsage.upsert.mockResolvedValue({});
    // null business → getEffectivePlan falls back to BASIC defaults silently
    dbMock.business.findUnique.mockResolvedValue(null);
    dbMock.stockMovement.create.mockResolvedValue({ id: "movement-2" });
    dbMock.product.update.mockResolvedValue({});
    dbMock.productRanking.upsert.mockResolvedValue({});
    dbMock.cashMovement.create.mockResolvedValue({ id: "movement-1" });
    dbMock.cashBox.update.mockResolvedValue({ id: "cashbox-1" });
  });

  it("persists core billing fields on create without a phantom billType column", async () => {
    const input = {
      total: 100,
      seller: "seller@test",
      paidMethod: "Efectivo",
      products: [product],
      billType: "Factura A",
    } as Parameters<typeof processSaleAction>[0] & { billType: string };

    await processSaleAction(input);

    expect(dbMock.order.create).toHaveBeenCalledTimes(1);
    const createData = dbMock.order.create.mock.calls[0]?.[0]?.data;
    expect(createData).toMatchObject({ total: 100, paymentMethod: "Efectivo" });
    expect(createData).toMatchObject({ billType: "Factura A" });
  });

  it("persists CAE via order.update and preserves billType in OrderUpdate history", async () => {
    await updateOrderCaeAction("order-1", {
      CAE: cae,
      IVACondition: "Responsable Inscripto",
      documentNumber: 20123456789,
      paidMethod: "Efectivo",
      billType: "Factura B",
    } as Parameters<typeof updateOrderCaeAction>[1] & { billType: string });

    expect(dbMock.order.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        CAE: cae,
        clientIvaCondition: "Responsable Inscripto",
        clientDocumentNumber: "20123456789",
        paymentMethod: "Efectivo",
      }),
    }));
    expect(dbMock.order.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ billType: "Factura B" }),
    }));
  });

  it("resolves billType from OrderUpdate history on detail; list maps core sale fields only", async () => {
    const order = historicalOrder();
    dbMock.order.findMany.mockResolvedValue([order]);
    dbMock.order.findUnique.mockResolvedValue(order);
    dbMock.orderUpdate.findFirst.mockResolvedValue({ changes: { billTypeTo: "Factura B" } });

    const list = await getSalesAction({ take: 10 });
    const detail = await getSaleByIdAction("order-1");

    expect(list.sales[0]).toMatchObject({ seller: "seller@test", paidMethod: "Efectivo" });
    expect(list.sales[0]?.billType).toBe("Factura B");
    expect(detail?.billType).toBe("Factura B");
    expect(detail?.ptoVenta).toBe(3);
  });

  it("uses Factura C only as the observable fallback for a legacy official sale", () => {
    expect(getBillTypeDisplay(undefined, cae.CAE, false)).toBe("Factura C");
  });

  it("never applies the official-invoice fallback to a remito without CAE", () => {
    expect(getBillTypeDisplay("Remito", null, true)).toBe("Remito");
    expect(getBillTypeDisplay(undefined, "   ", true)).toBe("Remito");
  });

  it("keeps an explicit unknown non-empty billType instead of silently changing it", () => {
    expect(getBillTypeDisplay("Tipo fiscal legado", cae.CAE, false)).toBe("Tipo fiscal legado");
  });
});

describe("improve-pdf: scaled PDF layout and receipt integrity", () => {
  const receipt = {
    businessName: "Comercio de prueba",
    date: new Date("2026-08-20T12:00:00Z"),
    documentType: "CUIT",
    billType: "Factura B",
    seller: "seller@test",
    paidMethod: "Efectivo",
    products: Array.from({ length: 30 }, (_, index) => ({
      description: `Producto ${index + 1}`,
      amount: 1,
      unitPrice: 100,
      subtotal: 100,
    })),
    subtotal: 3000,
    total: 3000,
    cae: { cae: cae.CAE, vencimiento: cae.vencimiento, qrData: cae.qrData, ptoVenta: cae.ptoVenta },
  };

  it("declares one centralized PDF layout scale of 1.30", () => {
    expect(PDF_STYLES).toMatch(/PDF_LAYOUT_SCALE|--pdf-layout-scale|1\.3/);
    expect(PDF_STYLES).toMatch(/1\.30|1\.3/);
  });

  it("keeps document kind, all products, totals, CAE and QR in the generated HTML", () => {
    const html = buildPDFHTML(receipt, { qrSvgDataUrl: "data:image/svg+xml;base64,QR" });

    // PDF preserves the authorized invoice's lettered fiscal type.
    expect(html).toContain(">Factura B<");
    expect(html).toContain("Producto 1");
    expect(html).toContain("Producto 30");
    expect(html).toContain("12345678901234");
    expect(html).toContain('alt="QR"');
    // report-C: amounts render with OUR es-AR formatCurrency (replaces toFixed(2))
    expect(html).toContain("$3.000,00");
  });

  it("defines vertical pagination and prevents unintended horizontal overflow", () => {
    expect(PDF_STYLES).toMatch(/page-break|break-(inside|after)|overflow-wrap|word-wrap/);
    expect(PDF_STYLES).toMatch(/max-width\s*:\s*100%/);
  });
});
