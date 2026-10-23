import { describe, expect, it, vi } from "vitest";
import { mapOrderToBillState } from "@/actions/sales/history";

const VALID_CAE = "71234567890123";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "sale-fiscal-boundary",
  CAE: { CAE: VALID_CAE, qrData: "signed-qr", nroComprobante: 42, ptoVenta: 7 },
  billType: "Factura B",
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
  ...overrides,
});

describe("CAE-derived sales presentation keeps fiscal eligibility independent", () => {
  it("does not turn valid-CAE presentation into fiscal eligibility when fiscal types conflict", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const state = mapOrderToBillState(order({
      billType: "Remito",
      afipVoucherType: 6,
    }) as never);

    expect(state.CAE?.CAE).toBe(VALID_CAE);
    expect(state.fiscalContext).toBeUndefined();
    expect(state.fiscalDiagnostic).toMatchObject({ status: "INVALID_OR_INCOMPLETE" });
    expect(state.billType).not.toBe("Factura");
    info.mockRestore();
  });

  it("does not make a no-CAE sale credit-note eligible because its metadata claims Factura", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const state = mapOrderToBillState(order({
      CAE: { CAE: "", nroComprobante: 42, ptoVenta: 7 },
      billType: "Factura B",
      afipVoucherType: 6,
    }) as never);

    expect(state.billType).toBe("Factura B");
    expect(state.fiscalContext).toBeUndefined();
    expect(state.fiscalDiagnostic).toMatchObject({ status: "INVALID_OR_INCOMPLETE", reason: "CAE_INVALID" });
    info.mockRestore();
  });
});
