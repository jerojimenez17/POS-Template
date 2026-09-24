import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { $transaction: vi.fn() } }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/pusher-server", () => ({ pusherServer: { trigger: vi.fn() } }));
vi.mock("@/lib/batch-utils", () => ({
  bulkUpdateStock: vi.fn(),
  processInBatches: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { processSaleAction } from "@/actions/sales/process";

describe("new-sale Factura A client snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1", businessId: "business-1" } } as never);
  });

  it("persists explicit client document type and leading-zero identifier", async () => {
    const orderCreate = vi.fn().mockResolvedValue({ id: "order-1" });
    vi.mocked(db.$transaction).mockImplementation(async (callback) => callback({
      cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }) },
      order: { create: orderCreate },
      stockMovement: { createMany: vi.fn() },
      cashBox: { update: vi.fn() },
      cashMovement: { create: vi.fn().mockResolvedValue({ id: "movement-1" }) },
      $executeRaw: vi.fn(),
    } as never));

    await processSaleAction({
      total: 100,
      totalWithDiscount: 100,
      seller: "Seller",
      paidMethod: "Efectivo",
      products: [{ id: "product-1", code: "P1", description: "Product", amount: 1, salePrice: 100 }],
      clientIvaCondition: "Responsable Inscripto",
      clientDocumentType: "DNI",
      clientDocumentNumber: "0012345678",
      CAE: { CAE: "123", vencimiento: "2026-01-01", nroComprobante: 1, qrData: "qr" },
      billType: "Factura A",
    } as never);

    expect(orderCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        clientIvaCondition: "Responsable Inscripto",
        clientDocumentType: "DNI",
        clientDocumentNumber: "0012345678",
      }),
    }));
  });
});
