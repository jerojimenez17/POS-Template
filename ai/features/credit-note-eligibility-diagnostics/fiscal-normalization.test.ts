import { describe, expect, it } from "vitest";
import { normalizeSaleFiscalMetadata } from "@/services/afip/credit-note";

const normalize = (input: Record<string, unknown>) =>
  normalizeSaleFiscalMetadata(input as Parameters<typeof normalizeSaleFiscalMetadata>[0]);

const validColumns = {
  CAE: " 71234567890123 ",
  billType: "Factura B",
  afipVoucherType: 6,
  invoiceNumber: 42,
  invoicePointOfSale: 7,
};

describe("credit-note fiscal normalization diagnostics", () => {
  it.each([undefined, null, "", " undefined ", "null", "NaN", "none"])(
    "classifies %j as NON_FISCAL without a diagnostic",
    (cae) => {
      expect(normalize({ billType: "Factura B", afipVoucherType: 6, cae })).toEqual({
        status: "NON_FISCAL",
      });
    },
  );

  it("normalizes a current-column fiscal sale as VALID and preserves the trimmed CAE", () => {
    expect(normalize(validColumns)).toEqual({
      status: "VALID",
      metadata: {
        billType: "Factura B",
        originalAfipVoucherType: 6,
        originalCAE: "71234567890123",
        invoiceNumber: 42,
        invoicePointOfSale: 7,
      },
    });
  });

  it("accepts serialized historical JSON and every documented historical alias", () => {
    expect(normalize({
      cae: JSON.stringify({
        cae: "71234567890123",
        number: "42",
        pointOfSale: "7",
        afipVoucherType: 6,
        billType: "Factura B",
      }),
    })).toMatchObject({ status: "VALID" });
  });

  it.each([
    ["alphanumeric CAE", "ORIGINAL-CAE"],
    ["short CAE", "1234567890123"],
    ["long CAE", "123456789012345"],
    ["QR payload", JSON.stringify({ cae: "71234567890123", qr: "secret-qr" })],
  ])("accepts non-empty historical CAE for %s", (_label, cae) => {
    expect(normalize({ ...validColumns, CAE: cae, cae: undefined })).toMatchObject({ status: "VALID", metadata: { billType: "Factura B" } });
  });

  it("rejects a QR URL presented as the CAE", () => {
    const cae = "https://example.test/qr?cae=71234567890123";
    expect(normalize({ ...validColumns, cae })).toMatchObject({
      status: "INVALID_OR_INCOMPLETE",
      reason: "CAE_INVALID",
      hasCaeSignal: true,
    });
  });

  it.each([
    ["missing number", { invoiceNumber: undefined }],
    ["zero number", { invoiceNumber: "0" }],
    ["decimal number", { invoiceNumber: "1.5" }],
    ["signed number", { invoiceNumber: "+1" }],
    ["exponent number", { invoiceNumber: "1e2" }],
    ["missing point of sale", { invoicePointOfSale: undefined }],
    ["unsupported bill type", { billType: "Remito" }],
    ["missing bill type and voucher type", { billType: undefined, afipVoucherType: undefined }],
  ])("rejects %s as an incomplete or unsupported fiscal record", (_label, overrides) => {
    const result = normalize({ ...validColumns, ...overrides }) as unknown as Record<string, unknown>;
    expect(result.status).toBe("INVALID_OR_INCOMPLETE");
    expect(result).toHaveProperty("hasCaeSignal", true);
    expect(result).toHaveProperty("reason");
  });

  it("accepts only safe positive integer numeric/string historical aliases", () => {
    expect(normalize({ ...validColumns, invoiceNumber: "00042", invoicePointOfSale: "007" })).toMatchObject({ status: "VALID" });
    expect(normalize({ ...validColumns, invoiceNumber: Number.MAX_SAFE_INTEGER })).toMatchObject({ status: "VALID" });
    expect(normalize({ ...validColumns, invoiceNumber: Number.MAX_SAFE_INTEGER + 1 })).toMatchObject({
      status: "INVALID_OR_INCOMPLETE",
      reason: "FISCAL_FIELDS_INCOMPLETE",
    });
  });

  it("rejects conflicting visible and historical fiscal types instead of choosing one", () => {
    expect(normalize({
      ...validColumns,
      cae: JSON.stringify({ CAE: "71234567890123", billType: "Factura A", afipVoucherType: 1 }),
      billType: "Factura B",
      afipVoucherType: 6,
    })).toMatchObject({
      status: "INVALID_OR_INCOMPLETE",
      reason: "FISCAL_TYPE_CONFLICT",
      hasCaeSignal: true,
    });
  });
});
