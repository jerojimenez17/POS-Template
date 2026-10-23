import { afterEach, describe, expect, it, vi } from "vitest";
import { mapOrderToBillState } from "@/actions/sales/history";
import { classifySalesSearchPresentation } from "@/services/sales-document-classification";

const VALID_CAE = "71234567890123";

afterEach(() => vi.restoreAllMocks());

describe("explicit nullable fiscal metadata at the mapped sale boundary", () => {
  it("keeps explicit billType null invalid despite valid CAE presentation and supported invoice metadata", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const persistedOrder = {
      id: "sale-explicit-null-bill-type",
      CAE: { CAE: VALID_CAE, qrData: "signed-qr", nroComprobante: 42, ptoVenta: 7 },
      billType: null,
      afipVoucherType: 6,
      invoiceNumber: 42,
      invoicePointOfSale: 7,
      total: 1200,
      discountAmount: 0,
      date: new Date("2026-01-15T12:00:00.000Z"),
      items: [{ id: "item-1", productId: "product-1", code: "P1", description: "Producto", price: 1200, costPrice: 900, quantity: 1 }],
      client: { name: "Cliente" },
      clientId: "client-1",
      seller: "seller@example.com",
      discountPercentage: 0,
      paymentMethod: "Efectivo",
      paymentMethod2: null,
      totalMethod2: null,
      clientIvaCondition: "Consumidor Final",
      clientDocumentNumber: "",
      clientDocumentType: null,
      returns: [],
    };

    const searchClass = classifySalesSearchPresentation(persistedOrder);
    const mappedSale = mapOrderToBillState(persistedOrder as never);

    expect(searchClass).toBe("FACTURA");
    expect(mappedSale.CAE?.CAE).toBe(VALID_CAE);
    expect(mappedSale.fiscalDiagnostic).toMatchObject({ status: "INVALID_OR_INCOMPLETE" });
    expect(mappedSale.fiscalContext).toBeUndefined();
    expect(mappedSale.creditNoteRecovery).toBeUndefined();
  });
});
