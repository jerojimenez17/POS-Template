import { describe, expect, it } from "vitest";
import {
  buildCreditNoteAssociation,
  mapOriginalBillTypeToCreditNoteAfipType,
  normalizeSaleFiscalMetadata,
  parseCreditNoteResponse,
} from "@/services/afip/credit-note";

const complete = (overrides: Record<string, unknown> = {}) => ({
  CAE: "  HISTORICAL-CAE-0007  ", billType: "Factura B", afipVoucherType: 6,
  invoiceNumber: 42, invoicePointOfSale: 7, ...overrides,
});

describe("AC-01..AC-03: relaxed historical CAE and strict new CAE", () => {
  it.each(["HISTORICAL-CAE-0007", "000000000000000000000000", "texto fiscal preservable"])(
    "accepts a non-empty original CAE without imposing 14 digits: %s",
    (originalCae) => {
      const result = normalizeSaleFiscalMetadata(complete({ CAE: ` ${originalCae} ` }));
      expect(result).toEqual(expect.objectContaining({ status: "VALID" }));
      if (result.status === "VALID") expect(result.metadata.originalCAE).toBe(originalCae);
    },
  );

  it.each([undefined, null, "", "   ", "undefined", "null"])(
    "does not treat %s as an original CAE",
    (originalCae) => expect(normalizeSaleFiscalMetadata(complete({ CAE: originalCae }))).toMatchObject({ status: "INVALID_OR_INCOMPLETE" }),
  );

  it("keeps the original CAE only in the association and never as the new CAE", () => {
    expect(buildCreditNoteAssociation({ originalVoucherType: 6, pointOfSale: 7, number: 42 })).toEqual({ Tipo: 6, PtoVta: 7, Nro: 42 });
    expect(parseCreditNoteResponse({ cae: "79999999999999", nroComprobante: 20, ptoVenta: 3 }, {
      originalCae: "HISTORICAL-CAE-0007", originalNumber: 42, originalPointOfSale: 7,
    })).toMatchObject({ cae: "79999999999999", originalCae: "HISTORICAL-CAE-0007" });
  });

  it.each([
    { cae: "7999999999999" }, { cae: "799999999999999" }, { cae: "7999999999999A" },
    { cae: " 79999999999999" }, { cae: "79999999999999 " }, { cae: "NEW-CAE" },
    { cae: "79999999999999", nroComprobante: 0 }, { cae: "79999999999999", nroComprobante: 1.5 },
    { cae: "79999999999999", ptoVenta: 0 }, { cae: "79999999999999", ptoVenta: 1.5 },
  ])("rejects an incomplete or non-strict ARCA response: %j", (response) => {
    const parsed = parseCreditNoteResponse(response, { originalCae: "historic", originalNumber: 42, originalPointOfSale: 7 });
    expect(parsed.cae === "" || parsed.number === 0 || parsed.pointOfSale === 0).toBe(true);
  });

  it.each([["Factura A", 3], ["Factura B", 8], ["Factura C", 13]] as const)(
    "maps %s to the credit-note AFIP type %s",
    (billType, voucherType) => expect(mapOriginalBillTypeToCreditNoteAfipType(billType)).toBe(voucherType),
  );
});
