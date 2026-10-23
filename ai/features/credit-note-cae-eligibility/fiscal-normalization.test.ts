import { describe, expect, it } from "vitest";
import { getFiscalDiagnosticLogFields, normalizeSaleFiscalMetadata } from "@/services/afip/credit-note";

const CAE = "71234567890123";
const normalize = (value: Record<string, unknown>) => normalizeSaleFiscalMetadata(value);

describe("credit-note CAE eligibility: historical fiscal normalization", () => {
  it.each([
    ["Factura A", 1],
    ["Factura B", 6],
    ["Factura C", 11],
  ] as const)("accepts %s and its compatible AFIP code from an object with qrData", (billType, afipVoucherType) => {
    expect(normalize({
      CAE: { CAE, qrData: "https://arca.example/qr", billType, afipVoucherType, nroComprobante: "42", ptoVenta: "7" },
    })).toEqual({
      status: "VALID",
      metadata: { billType, originalAfipVoucherType: afipVoucherType, originalCAE: CAE, invoiceNumber: 42, invoicePointOfSale: 7 },
    });
  });

  it("accepts serialized historical JSON, lowercase cae, and aliases distributed across sources", () => {
    expect(normalize({
      cae: JSON.stringify({ cae: CAE, qrData: { version: 1 }, billType: "B" }),
      number: "00042",
      pointOfSale: "007",
      afipVoucherType: 6,
    })).toMatchObject({ status: "VALID", metadata: { originalCAE: CAE, billType: "Factura B", invoiceNumber: 42, invoicePointOfSale: 7, originalAfipVoucherType: 6 } });
  });

  it("reproduces the historical missing-type diagnostic without guessing a type", () => {
    const input = { cae: JSON.stringify({ CAE, qrData: "signed-qr" }), invoiceNumber: 42, invoicePointOfSale: 7 };
    const result = normalize(input);
    expect(result).toMatchObject({ status: "INVALID_OR_INCOMPLETE", reason: "FISCAL_FIELDS_INCOMPLETE", hasCaeSignal: true, missingFields: ["billType"], canCompleteFromUser: true });
    expect(getFiscalDiagnosticLogFields(input, result)).toEqual({
      source: "historical_json",
      hasCaeSignal: true,
      hasValidCae: false,
      hasInvoiceNumber: true,
      hasPointOfSale: true,
      hasBillType: false,
      hasVoucherType: false,
    });
  });

  it.each([
    ["QR URL", "https://example.test/qr?cae=" + CAE],
    ["empty CAE", { CAE: "", billType: "Factura B", afipVoucherType: 6, invoiceNumber: 42, invoicePointOfSale: 7 }],
  ])("rejects %s without treating it as an official CAE", (_label, cae) => {
    expect(normalize({ CAE: cae })).toMatchObject({
      status: "INVALID_OR_INCOMPLETE",
      reason: "CAE_INVALID",
      hasCaeSignal: true,
    });
  });

  it.each([
    ["QR payload", { qr: "signed-payload", cae: CAE }],
    ["alphanumeric CAE", "ORIGINAL-CAE"],
    ["wrong length", "1234567890123"],
  ])("accepts non-empty historical CAE text for %s", (_label, cae) => {
    expect(normalize({ CAE: cae, billType: "Factura B", afipVoucherType: 6, invoiceNumber: 42, invoicePointOfSale: 7 })).toMatchObject({
      status: "VALID",
      metadata: { billType: "Factura B", invoiceNumber: 42, invoicePointOfSale: 7 },
    });
  });

  it.each([
    ["incompatible code", { billType: "Factura A", afipVoucherType: 6 }],
    ["unsupported code", { billType: "Factura B", afipVoucherType: 99 }],
    ["conflicting bill types", { billType: "Factura B", cae: JSON.stringify({ CAE, billType: "Factura A", afipVoucherType: 1 }) }],
  ])("rejects %s rather than silently selecting a fiscal type", (_label, overrides) => {
    expect(normalize({ CAE, invoiceNumber: 42, invoicePointOfSale: 7, ...overrides })).toMatchObject({
      status: "INVALID_OR_INCOMPLETE",
      hasCaeSignal: true,
    });
  });
});
