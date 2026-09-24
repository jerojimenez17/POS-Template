import { describe, expect, it } from "vitest";
import {
  buildCreditNoteCreateVoucherPayload,
  buildCreditNoteVoucherState,
  mapOriginalBillTypeToCreditNoteAfipType,
} from "@/services/afip/credit-note";
import { parseAfipVoucherResponse } from "@/services/afip/voucher-response";

const authorizedSnapshot = {
  version: 1,
  source: "AUTHORIZED_VOUCHER",
  billType: "Factura A",
  afipVoucherType: 1,
  issuerIvaCondition: "Responsable Inscripto",
  buyerIvaCondition: "Responsable Inscripto",
  currency: "ARS",
  total: 121,
  net: 100,
  vat: 21,
  nonTaxed: 0,
  exempt: 0,
  otherTaxes: 0,
  iva: [{ id: 5, base: 100, amount: 21 }],
} as const;

const originalTwoRateSnapshot = {
  ...authorizedSnapshot,
  total: 181,
  net: 150,
  vat: 31,
  iva: [
    { id: 4, base: 50, amount: 5 },
    { id: 5, base: 100, amount: 26 },
  ],
};

function stateFromSnapshot(snapshot: unknown, billType = "Factura A") {
  const input = {
    billType,
    emissionPointOfSale: 9,
    nroAsociado: 45,
    ptoVentaAsociado: 3,
    caeAsociado: "12345678901234",
    products: [{ id: "sku-1", code: "SKU-1", description: "Actual catalog price is irrelevant", price: 999, salePrice: 999, amount: 1 }],
    total: 181,
    totalWithDiscount: 181,
    IVACondition: "Consumidor Final",
    discount: 0,
    fiscalSnapshot: snapshot,
  };
  return buildCreditNoteVoucherState(
    input as unknown as Parameters<typeof buildCreditNoteVoucherState>[0],
  ) as ReturnType<typeof buildCreditNoteVoucherState> & { fiscalSnapshot?: unknown };
}

describe("authorized fiscal snapshot for full credit notes", () => {
  it("normalizes and returns the complete server-authorized fiscal snapshot with an authorized invoice", () => {
    const parsed = parseAfipVoucherResponse({
      success: true,
      data: {
        CAE: "12345678901234",
        nroCbte: 45,
        ptoVenta: 3,
        fiscalSnapshot: authorizedSnapshot,
      },
    }, { ptoVenta: 3, tipoFactura: 1 });

    expect(parsed.kind).toBe("success");
    if (parsed.kind !== "success") return;
    expect(parsed.data).toMatchObject({
      cae: "12345678901234",
      nroComprobante: 45,
      ptoVenta: 3,
      fiscalSnapshot: authorizedSnapshot,
    });
  });

  it.each([
    ["Factura A", 3],
    ["Factura B", 8],
    ["Factura C", 13],
  ] as const)("maps %s only to its corresponding credit-note type %i", (billType, creditNoteType) => {
    expect(mapOriginalBillTypeToCreditNoteAfipType(billType)).toBe(creditNoteType);
  });

  it("retains an immutable snapshot separately from products and current buyer conditions", () => {
    const state = stateFromSnapshot(originalTwoRateSnapshot);

    expect(state.fiscalSnapshot).toEqual(originalTwoRateSnapshot);
    expect(state.products[0]?.price).toBe(999);
    expect(state.IVACondition).toBe("Consumidor Final");
    expect(state.fiscalSnapshot).not.toBe(state.products);
  });

  it("serializes the original total, post-discount components and all rate groups without rebuilding from products", () => {
    const state = stateFromSnapshot(originalTwoRateSnapshot);
    const payload = buildCreditNoteCreateVoucherPayload({
      arca: { puntoVenta: 9, tipoFactura: 3 },
      billState: state,
    });
    const billState = payload.billState as Record<string, unknown>;

    expect(payload.arca).toMatchObject({ puntoVenta: 9, tipoFactura: 3 });
    expect(billState).toMatchObject({
      billType: "Factura A",
      total: 181,
      totalWithDiscount: 181,
      discount: 0,
      nroAsociado: 45,
      ptoVentaAsociado: 3,
      CbtesAsoc: [{ Tipo: 1, PtoVta: 3, Nro: 45 }],
      fiscalBreakdown: {
        source: "AUTHORIZED_VOUCHER",
        version: 1,
        originalAfipVoucherType: 1,
        ImpTotal: 181,
        ImpNeto: 150,
        ImpIVA: 31,
        ImpTotConc: 0,
        ImpOpEx: 0,
        ImpTrib: 0,
        Iva: [
          { Id: 4, BaseImp: 50, Importe: 5 },
          { Id: 5, BaseImp: 100, Importe: 26 },
        ],
      },
    });
  });

  it("rejects positive net with an omitted or empty VAT group list", () => {
    for (const iva of [undefined, []]) {
      const invalid = { ...authorizedSnapshot, iva };
      expect(() => buildCreditNoteCreateVoucherPayload({
        arca: { puntoVenta: 9, tipoFactura: 3 },
        billState: stateFromSnapshot(invalid),
      })).toThrow();
    }
  });

  it.each([
    ["unknown snapshot version", { ...authorizedSnapshot, version: 2 }],
    ["non-finite net", { ...authorizedSnapshot, net: Number.NaN }],
    ["negative VAT", { ...authorizedSnapshot, vat: -1 }],
    ["group sum inconsistent with VAT total", { ...authorizedSnapshot, iva: [{ id: 5, base: 100, amount: 20 }] }],
    ["Factura C with invented VAT", { ...authorizedSnapshot, billType: "Factura C", afipVoucherType: 11 }],
  ])("rejects %s instead of silently dropping or completing fiscal data", (_description, snapshot) => {
    expect(() => buildCreditNoteCreateVoucherPayload({
      arca: { puntoVenta: 9, tipoFactura: 3 },
      billState: stateFromSnapshot(snapshot),
    })).toThrow();
  });
});
