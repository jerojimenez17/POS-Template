import { describe, expect, it } from "vitest";
import { normalizeSaleFiscalMetadata } from "@/services/afip/credit-note";

const fiscal = (overrides: Record<string, unknown> = {}) => normalizeSaleFiscalMetadata({
  CAE: { CAE: "71234567890123" },
  billType: "Factura B",
  afipVoucherType: 6,
  invoiceNumber: 42,
  invoicePointOfSale: 7,
  ...overrides,
});

describe("credit-note missing-data recovery diagnostic (RED)", () => {
  it("reports only billType when a historical invoice has CAE, number and point", () => {
    expect(fiscal({ billType: undefined, afipVoucherType: undefined })).toMatchObject({
      status: "INVALID_OR_INCOMPLETE",
      missingFields: ["billType"],
      canCompleteFromUser: true,
    });
  });

  it("does not ask for CAE in the primary historical billType case", () => {
    const result = fiscal({ billType: undefined, afipVoucherType: undefined }) as Record<string, unknown>;
    expect(result.missingFields).not.toContain("CAE");
  });

  it.each([
    ["invoiceNumber", { invoiceNumber: undefined }, ["invoiceNumber"]],
    ["invoicePointOfSale", { invoicePointOfSale: undefined }, ["invoicePointOfSale"]],
    ["all allowed fields", { billType: undefined, afipVoucherType: undefined, invoiceNumber: undefined, invoicePointOfSale: undefined }, ["billType", "invoiceNumber", "invoicePointOfSale"]],
  ])("diagnoses missing %s as recoverable", (_label, overrides, missingFields) => {
    expect(fiscal(overrides)).toMatchObject({ status: "INVALID_OR_INCOMPLETE", missingFields, canCompleteFromUser: true });
  });

  it("derives the original bill type from voucher code without asking for type", () => {
    expect(fiscal({ billType: undefined })).toMatchObject({ status: "VALID", metadata: { billType: "Factura B" } });
  });

  it("rejects a URL presented as the historical CAE", () => {
    const CAE = "https://arca.test/qr?cae=71234567890123";
    expect(fiscal({ CAE })).toMatchObject({ status: "INVALID_OR_INCOMPLETE", reason: "CAE_INVALID", canCompleteFromUser: false });
  });

  it.each(["123", "1234567890123", "123456789012345", "ORIGINAL-CAE"])("accepts non-empty historical CAE text: %s", (CAE) => {
    expect(fiscal({ CAE })).toMatchObject({ status: "VALID", metadata: { originalCAE: CAE } });
  });

  it("blocks a present invalid number instead of treating it as a missing field", () => {
    expect(fiscal({ invoiceNumber: "1.5" })).toMatchObject({ status: "INVALID_OR_INCOMPLETE", canCompleteFromUser: false });
  });

  it("blocks incompatible bill type and voucher code", () => {
    expect(fiscal({ billType: "Factura A", afipVoucherType: 6 })).toMatchObject({ status: "INVALID_OR_INCOMPLETE", reason: "FISCAL_TYPE_CONFLICT", canCompleteFromUser: false });
  });

  it("classifies a manual sale without fiscal signal as silent NON_FISCAL", () => {
    expect(normalizeSaleFiscalMetadata({ billType: undefined, CAE: null })).toEqual({ status: "NON_FISCAL" });
  });
});
