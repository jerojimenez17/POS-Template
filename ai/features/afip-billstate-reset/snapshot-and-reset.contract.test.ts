import { describe, expect, it } from "vitest";
import { createBillCheckoutSnapshot } from "@/utils/billing";
import BillTypes from "@/models/billType";
import type BillState from "@/models/BillState";

const state: BillState = {
  id: "sale-1", products: [{ id: "p1", description: "Producto", salePrice: 100, amount: 2 } as never],
  total: 200, totalWithDiscount: 180, discount: 10, seller: "seller",
  date: new Date("2026-02-01T00:00:00.000Z"), typeDocument: "DNI", documentNumber: 42,
  IVACondition: "Consumidor Final", twoMethods: false, paidMethod: "Efectivo",
  billType: BillTypes.A, ptoVenta: 12,
  CAE: { CAE: "99999999999999", nroComprobante: 7, vencimiento: "20261231", qrData: "qr", ptoVenta: 12 },
};

describe("AFIP print snapshot contract", () => {
  it("captures the original invoice data independently of later live-state resets", () => {
    const snapshot = createBillCheckoutSnapshot(state, BillTypes.A);
    state.products.length = 0;
    state.total = 0;
    state.CAE = undefined;

    expect(snapshot.products).toHaveLength(1);
    expect(snapshot.total).toBe(200);
    expect(snapshot.billType).toBe(BillTypes.A);
    expect(snapshot.ptoVenta).toBe(12);
    expect(snapshot.CAE?.CAE).toBe("99999999999999");
  });

  it.each([BillTypes.A, BillTypes.B, BillTypes.C])(
    "does not turn a successful invoice snapshot into Remito/Presupuesto (%s)",
    (billType) => expect(createBillCheckoutSnapshot(state, billType).billType).toBe(billType),
  );
});
