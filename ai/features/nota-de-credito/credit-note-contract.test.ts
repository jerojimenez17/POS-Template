import { describe, expect, it } from "vitest";

interface ContractModule {
  buildCreditNoteCreateVoucherPayload: (input: Record<string, unknown>) => Record<string, unknown>;
  validateCreditNoteVoucherType: (type: number, operation?: "invoice" | "credit-note") => void;
}

const contractModulePath = "@/services/afip/credit-note";
const loadContract = async () =>
  (await import(/* @vite-ignore */ contractModulePath)) as unknown as ContractModule;

describe("nota de crédito: createVoucher contract", () => {
  it("sends association data and does not replace the new voucher CAE with the original CAE", async () => {
    const contract = await loadContract();
    const payload = contract.buildCreditNoteCreateVoucherPayload({
      action: "createVoucher",
      arca: { puntoVenta: 7, tipoFactura: 8 },
      billState: {
        billType: "Factura B",
        nroAsociado: 1234,
        ptoVentaAsociado: 7,
        caeAsociado: "ORIGINAL-CAE",
        products: [],
        total: 100,
        totalWithDiscount: 100,
        fiscalSnapshot: {
          version: 1,
          source: "AUTHORIZED_VOUCHER",
          billType: "Factura B",
          afipVoucherType: 6,
          issuerIvaCondition: "Responsable Inscripto",
          buyerIvaCondition: "Consumidor Final",
          currency: "ARS",
          total: 100,
          net: 82.64,
          vat: 17.36,
          nonTaxed: 0,
          exempt: 0,
          otherTaxes: 0,
          iva: [{ id: 5, base: 82.64, amount: 17.36 }],
        },
        IVACondition: "Consumidor Final",
      },
      cert: "secret",
      key: "secret",
      internalKey: "secret",
    });

    expect(payload).toMatchObject({
      action: "createVoucher",
      billState: expect.objectContaining({ nroAsociado: 1234 }),
    });
    expect(payload.billState).toMatchObject({
      CbtesAsoc: expect.arrayContaining([expect.objectContaining({ Tipo: 6, PtoVta: 7, Nro: 1234 })]),
    });
    expect(payload).not.toHaveProperty("cert");
    expect(payload).not.toHaveProperty("key");
    expect(payload).not.toHaveProperty("internalKey");
    expect(payload.billState).not.toHaveProperty("CAE", "ORIGINAL-CAE");
  });

  it.each([3, 8, 13])("accepts NC AFIP type %s only for the NC operation", async (type) => {
    const contract = await loadContract();
    expect(() => contract.validateCreditNoteVoucherType(type, "credit-note")).not.toThrow();
    expect(() => contract.validateCreditNoteVoucherType(type, "invoice")).toThrow();
  });
});
