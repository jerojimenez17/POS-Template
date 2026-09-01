// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BillReducer } from "@/context/BillReducer";
import BillTypes from "@/models/billType";
import type BillState from "@/models/BillState";
import Product from "@/models/Product";

const product = Object.assign(new Product(), {
  id: "old-product",
  description: "Venta anterior",
  salePrice: 125,
  amount: 2,
});

function oldCheckout(): BillState {
  return {
    id: "old-order",
    products: [product],
    total: 250,
    totalWithDiscount: 200,
    seller: "old-seller@example.com",
    discount: 20,
    date: new Date("2026-01-01T00:00:00.000Z"),
    typeDocument: "DNI",
    documentNumber: 12345678,
    IVACondition: "Responsable Inscripto",
    twoMethods: true,
    secondPaidMethod: "Debito",
    totalSecondMethod: 100,
    paidMethod: "Transferencia",
    pago: true,
    entrega: 50,
    nroAsociado: 77,
    billType: BillTypes.A,
    clientId: "old-client",
    client: "Cliente anterior",
    clientIvaCondition: "Responsable Inscripto",
    clientDocumentNumber: "20-12345678-9",
    ptoVenta: 99,
    CAE: {
      CAE: "12345678901234",
      nroComprobante: 456,
      vencimiento: "20261231",
      qrData: "old-qr",
      ptoVenta: 99,
    },
  };
}

describe("BillReducer removeAll checkout contract", () => {
  it.each([BillTypes.A, BillTypes.B, BillTypes.C])(
    "keeps the configured default bill type (%s), never the previous type",
    (defaultBillType) => {
      const result = BillReducer(oldCheckout(), {
        type: "removeAll",
        payload: null,
        defaultBillType,
      });

      expect(result.billType).toBe(defaultBillType);
    },
  );

  it("removes every sale value while preserving only the new-sale POS default", () => {
    const before = oldCheckout();
    const resetAt = before.date;
    const result = BillReducer(before, {
      type: "removeAll",
      payload: null,
      defaultBillType: BillTypes.B,
    });

    expect(result).toMatchObject({
      products: [],
      total: 0,
      totalWithDiscount: 0,
      discount: 0,
      id: "",
      documentNumber: 0,
      typeDocument: "",
      nroAsociado: 0,
      entrega: 0,
      pago: false,
      twoMethods: false,
      paidMethod: "Efectivo",
      totalSecondMethod: 0,
      billType: BillTypes.B,
      ptoVenta: 12,
      seller: "",
    });
    expect(result).not.toHaveProperty("client");
    expect(result).not.toHaveProperty("clientId");
    expect(result).not.toHaveProperty("clientIvaCondition");
    expect(result).not.toHaveProperty("clientDocumentNumber");
    expect(result).not.toHaveProperty("secondPaidMethod");
    expect(result.CAE).toEqual({ CAE: "", nroComprobante: 0, vencimiento: "", qrData: "" });
    expect(result.date).not.toBe(resetAt);
  });

  it("uses Factura B when called without an explicit default in an isolated reducer", () => {
    expect(BillReducer(oldCheckout(), { type: "removeAll", payload: null }).billType).toBe(
      BillTypes.B,
    );
  });
});
