import { describe, expect, it } from "vitest";

interface CreditNoteMappingModule {
  mapOriginalBillTypeToCreditNoteAfipType: (billType: string) => number;
  mapOriginalBillTypeToInvoiceAfipType: (billType: string) => number;
  buildCreditNoteAssociation: (input: {
    originalVoucherType: 1 | 6 | 11;
    pointOfSale: number;
    number: number;
    issuedAt?: Date;
  }) => Record<string, unknown>;
  buildCreditNoteVoucherState: (input: Record<string, unknown>) => Record<string, unknown>;
  parseCreditNoteResponse: (input: unknown, original: Record<string, unknown>) => Record<string, unknown>;
}

const mappingModulePath = "@/services/afip/credit-note";
const loadMapping = async () =>
  (await import(/* @vite-ignore */ mappingModulePath)) as unknown as CreditNoteMappingModule;

describe("nota de crédito: pure AFIP mapping contract", () => {
  it.each([
    ["Factura A", 3],
    ["Factura B", 8],
    ["Factura C", 13],
  ] as const)("maps %s to AFIP credit-note type %s", async (billType, expected) => {
    const mapping = await loadMapping();
    expect(mapping.mapOriginalBillTypeToCreditNoteAfipType(billType)).toBe(expected);
  });

  it.each(["Remito", "Presupuesto", "", "Factura X", "Nota de Crédito A"])(
    "rejects unsupported original type %s",
    async (billType) => {
      const mapping = await loadMapping();
      expect(() => mapping.mapOriginalBillTypeToCreditNoteAfipType(billType)).toThrow(
        /Factura A|Factura B|Factura C|soport/i,
      );
    },
  );

  it.each([
    ["Factura A", 1],
    ["Factura B", 6],
    ["Factura C", 11],
  ] as const)("keeps invoice validation separate from NC mapping for %s", async (billType, expected) => {
    const mapping = await loadMapping();
    expect(mapping.mapOriginalBillTypeToInvoiceAfipType(billType)).toBe(expected);
    expect(mapping.mapOriginalBillTypeToCreditNoteAfipType(billType)).not.toBe(expected);
  });

  it("builds CbtesAsoc from the original fiscal type, point and number", async () => {
    const mapping = await loadMapping();
    const association = mapping.buildCreditNoteAssociation({
      originalVoucherType: 6,
      pointOfSale: 7,
      number: 1234,
      issuedAt: new Date("2026-09-19T00:00:00.000Z"),
    });

    expect(association).toMatchObject({ Tipo: 6, PtoVta: 7, Nro: 1234 });
    expect(Number.isInteger(association.Nro)).toBe(true);
    expect(association.Nro).not.toBe("order-1234");
  });

  it("creates a minimal voucher state without secrets or client-controlled financial fields", async () => {
    const mapping = await loadMapping();
    const state = mapping.buildCreditNoteVoucherState({
      billType: "Factura B",
      nroAsociado: 1234,
      ptoVentaAsociado: 7,
      caeAsociado: "ORIGINAL-CAE",
      products: [{ id: "p1", code: "P1", description: "Producto", price: 10, salePrice: 10, amount: 2 }],
      total: 20,
      totalWithDiscount: 20,
      IVACondition: "Consumidor Final",
      internalKey: "must-not-leak",
      certificate: "must-not-leak",
      privateKey: "must-not-leak",
      clientSuppliedTotal: 999,
    });

    expect(state).toMatchObject({ billType: "Factura B", nroAsociado: 1234, total: 20 });
    expect(state).not.toHaveProperty("internalKey");
    expect(state).not.toHaveProperty("certificate");
    expect(state).not.toHaveProperty("privateKey");
    expect(state).not.toHaveProperty("clientSuppliedTotal");
    expect(state).not.toHaveProperty("CAE");
  });

  it("keeps the new CAE and number separate from the original metadata", async () => {
    const mapping = await loadMapping();
    const parsed = mapping.parseCreditNoteResponse(
      { CAE: "79999999999999", nroComprobante: 88, ptoVenta: 7, vencimiento: "20261001" },
      { originalCae: "ORIGINAL-CAE", originalNumber: 1234, originalPointOfSale: 7 },
    );

    expect(parsed).toMatchObject({ cae: "79999999999999", number: 88, pointOfSale: 7 });
    expect(parsed).toMatchObject({ originalCae: "ORIGINAL-CAE", originalNumber: 1234 });
  });
});
