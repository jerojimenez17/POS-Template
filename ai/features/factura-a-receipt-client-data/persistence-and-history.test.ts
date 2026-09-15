import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    order: { update: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { updateOrderCaeAction } from "@/actions/sales/update";
import { getSaleByIdAction } from "@/actions/sales/history";

const cae = { CAE: "123", vencimiento: "2026-01-01", nroComprobante: 1, qrData: "qr" };

describe("Factura A durable client snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1", businessId: "business-1" } } as never);
    vi.mocked(db.order.update).mockResolvedValue({} as never);
  });

  it.each([
    ["CUIT", "20123456789"],
    ["DNI", "0012345678"],
  ] as const)("persists the selected %s and exact identifier", async (documentType, documentNumber) => {
    const input = {
      CAE: cae,
      IVACondition: "Responsable Inscripto",
      documentType,
      documentNumber,
      paidMethod: "Efectivo",
    } as unknown as Parameters<typeof updateOrderCaeAction>[1];

    await updateOrderCaeAction("order-1", input);

    expect(db.order.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-1", businessId: "business-1" },
      data: expect.objectContaining({
        CAE: cae,
        clientIvaCondition: "Responsable Inscripto",
        clientDocumentType: documentType,
        clientDocumentNumber: documentNumber,
        paymentMethod: "Efectivo",
      }),
    }));
  });

  it("rejects a document type other than CUIT or DNI", async () => {
    const result = await updateOrderCaeAction("order-1", {
      CAE: cae,
      IVACondition: "Responsable Inscripto",
      documentType: "PASSPORT",
      documentNumber: "123",
      paidMethod: "Efectivo",
    } as unknown as Parameters<typeof updateOrderCaeAction>[1]);

    expect(result).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("rejects a blank document for a non-Consumidor Final request without retaining stale identity", async () => {
    const result = await updateOrderCaeAction("order-1", {
      CAE: cae,
      IVACondition: "Responsable Inscripto",
      documentType: "DNI",
      documentNumber: "   ",
      paidMethod: "Efectivo",
    } as unknown as Parameters<typeof updateOrderCaeAction>[1]);

    expect(result).toEqual({ error: "El número de documento es obligatorio para esta condición de IVA" });
    expect(db.order.update).not.toHaveBeenCalled();
    expect(vi.mocked(db.order.update)).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clientDocumentType: "DNI" }),
    }));
  });

  it("maps persisted type independently from IVA and preserves string identifiers in history", async () => {
    vi.mocked(db.order.findUnique).mockResolvedValue({
      id: "order-1", businessId: "business-1", date: new Date("2026-01-01"),
      total: 10, discountAmount: 0, discountPercentage: 0, seller: "Seller",
      clientId: null, client: { name: "Client" }, clientIvaCondition: "Responsable Inscripto",
      clientDocumentType: "DNI", clientDocumentNumber: "0012345678", paymentMethod: "Efectivo",
      paymentMethod2: null, totalMethod2: null, CAE: cae, items: [],
    } as never);

    const bill = await getSaleByIdAction("order-1");

    expect(bill).toEqual(expect.objectContaining({
      typeDocument: "DNI",
      clientIvaCondition: "Responsable Inscripto",
      clientDocumentNumber: "0012345678",
    }));
    expect(typeof bill?.clientDocumentNumber).toBe("string");
  });

  it.each([
    ["12345678901", "CUIT"],
    ["12345678", "DNI"],
    ["", ""],
  ])("uses the documented legacy fallback for identifier %s", async (identifier, expectedType) => {
    vi.mocked(db.order.findUnique).mockResolvedValue({
      id: "legacy", businessId: "business-1", date: new Date(), total: 1,
      discountAmount: 0, discountPercentage: 0, seller: "Seller", clientId: null, client: null,
      clientIvaCondition: "Consumidor Final", clientDocumentType: null,
      clientDocumentNumber: identifier, paymentMethod: "Efectivo", paymentMethod2: null,
      totalMethod2: null, CAE: null, items: [],
    } as never);

    const bill = await getSaleByIdAction("legacy");
    expect(bill?.typeDocument).toBe(expectedType);
  });
});
