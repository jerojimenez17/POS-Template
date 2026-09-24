import { describe, expect, it } from "vitest";
import { mapOrderToBillState } from "@/actions/sales/history";
import { parseCAE } from "@/lib/cae";
import { formatInvoiceNumberFull, isAFIPAuthorized } from "@/lib/utils/bill-type";

const VALID_CAE = "71234567890123";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "sale-official-1",
  CAE: null,
  total: 1200,
  discountAmount: 0,
  date: new Date("2026-01-01T00:00:00.000Z"),
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
  ...overrides,
});

describe("searchBill official invoice contract", () => {
  it("propagates a persisted CAE through Order -> BillState without losing fiscal fields", () => {
    const persistedCAE = {
      CAE: VALID_CAE,
      vencimiento: "20261231",
      nroComprobante: 42,
      qrData: "qr-data",
      ptoVenta: 7,
    };

    const state = mapOrderToBillState(order({ CAE: persistedCAE, invoiceNumber: 42, invoicePointOfSale: 7 }) as never);

    expect(state.CAE).toEqual(persistedCAE);
    expect(state.CAE?.CAE).toBe(VALID_CAE);
    expect(isAFIPAuthorized(undefined, state.CAE?.CAE)).toBe(true);
  });

  it.each([
    ["null", null],
    ["missing", undefined],
    ["non-object JSON", 42],
    ["missing CAE property", { nroComprobante: 42 }],
    ["non-string CAE", { CAE: 71234567890123 }],
    ["empty CAE", { CAE: "" }],
    ["whitespace CAE", { CAE: "   " }],
  ] as const)("maps %s to no official CAE without throwing", (_label, value) => {
    const state = mapOrderToBillState(order({ CAE: value }) as never);

    expect(state.CAE).toBeUndefined();
    expect(isAFIPAuthorized(undefined, state.CAE?.CAE)).toBe(false);
  });

  it("keeps a valid CAE official even when invoice content is incomplete", () => {
    const state = mapOrderToBillState(order({
      CAE: { CAE: VALID_CAE },
      items: [],
      invoiceNumber: undefined,
    }) as never);

    expect(state.CAE?.CAE).toBe(VALID_CAE);
    expect(isAFIPAuthorized(undefined, state.CAE?.CAE)).toBe(true);
  });

  describe("parseCAE historical persisted shapes", () => {
    it.each([
      ["canonical object", { CAE: VALID_CAE, vencimiento: "20261231", nroComprobante: 42, qrData: "qr" }],
      ["serialized JSON object", JSON.stringify({ CAE: VALID_CAE, vencimiento: "20261231", nroComprobante: "42", qrData: "qr" })],
    ] as const)("accepts %s", (_label, value) => {
      expect(parseCAE(value)).toMatchObject({ CAE: VALID_CAE, nroComprobante: expect.anything() });
    });

    it.each(["", "   ", "not-json", "{}", JSON.stringify({ CAE: "" }), JSON.stringify({ CAE: "   " })])(
      "rejects empty or malformed historical CAE %p",
      (value) => expect(parseCAE(value)).toBeUndefined(),
    );
  });

  it("classifies only non-empty CAE values as official and keeps legacy remitos non-official", () => {
    expect(isAFIPAuthorized("Factura C", VALID_CAE)).toBe(true);
    expect(isAFIPAuthorized("Factura C", " ")).toBe(false);
    expect(isAFIPAuthorized("Factura C", undefined)).toBe(false);
    expect(formatInvoiceNumberFull(42, 7)).toBe("007-0042");
    expect(formatInvoiceNumberFull("0000042", undefined)).toBe("000-0042");
  });
});
