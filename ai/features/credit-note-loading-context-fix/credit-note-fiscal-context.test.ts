import { describe, expect, it } from "vitest";
import {
  mapOriginalBillTypeToCreditNoteAfipType,
  mapOriginalBillTypeToInvoiceAfipType,
} from "@/services/afip/credit-note";
import { mapOrderToBillState } from "@/actions/sales/history";

describe("credit-note fiscal context", () => {
  it.each([
    ["Factura A", 1, 3],
    ["Factura B", 6, 8],
    ["Factura C", 11, 13],
  ] as const)("maps %s to the original and credit-note AFIP types", (billType, originalType, creditNoteType) => {
    expect(mapOriginalBillTypeToInvoiceAfipType(billType)).toBe(originalType);
    expect(mapOriginalBillTypeToCreditNoteAfipType(billType)).toBe(creditNoteType);
  });

  it("normalizes a historical CAE payload when new fiscal columns are absent", () => {
    const state = mapOrderToBillState({
      id: "order-historical",
      CAE: JSON.stringify({ CAE: "71234567890123", nroComprobante: 42, ptoVenta: 7 }),
      billType: "Factura B",
      afipVoucherType: 6,
      invoiceNumber: undefined,
      invoicePointOfSale: undefined,
      total: 1200,
      discountAmount: 0,
      date: new Date("2026-01-01T00:00:00.000Z"),
      items: [],
      client: null,
      clientId: null,
      seller: "seller",
      discountPercentage: 0,
      paymentMethod: "Efectivo",
      paymentMethod2: null,
      totalMethod2: null,
      clientIvaCondition: "Consumidor Final",
      clientDocumentNumber: null,
      clientDocumentType: null,
    } as never);

    expect(state).toMatchObject({
      fiscalContext: expect.objectContaining({
        originalCAE: "71234567890123",
        invoiceNumber: 42,
        invoicePointOfSale: 7,
        originalAfipVoucherType: 6,
        eligibleForFullCreditNote: false,
      }),
    });
  });

  it("does not make an ambiguous historical fiscal record eligible", () => {
    const state = mapOrderToBillState({
      id: "order-ambiguous",
      CAE: JSON.stringify({ CAE: "undefined", nroComprobante: "not-a-number", ptoVenta: 0 }),
      billType: "Factura A",
      afipVoucherType: 1,
      total: 100,
      discountAmount: 0,
      date: new Date(),
      items: [],
      client: null,
      clientId: null,
      seller: "seller",
      discountPercentage: 0,
      paymentMethod: "Efectivo",
      paymentMethod2: null,
      totalMethod2: null,
      clientIvaCondition: "Consumidor Final",
      clientDocumentNumber: null,
      clientDocumentType: null,
    } as never);

    expect(state).toMatchObject({ fiscalDiagnostic: expect.objectContaining({ reason: "CAE_INVALID" }) });
  });
});
