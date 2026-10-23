import { describe, expect, it, vi } from "vitest";
import { mapOrderToBillState } from "@/actions/sales/history";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "order-diagnostic",
  CAE: null,
  billType: "Factura B",
  afipVoucherType: 6,
  invoiceNumber: 42,
  invoicePointOfSale: 7,
  total: 1200,
  discountAmount: 0,
  date: new Date("2026-01-01T00:00:00.000Z"),
  items: [{ id: "item-1", productId: "product-1", code: "P1", description: "Producto", price: 1200, costPrice: 900, quantity: 1 }],
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
  ...overrides,
});

describe("sale history fiscal diagnostic mapping", () => {
  it("omits fake fiscalContext and diagnostic for NON_FISCAL sales", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const state = mapOrderToBillState(order() as never) as unknown as Record<string, unknown>;

    expect(state).not.toHaveProperty("fiscalContext");
    expect(state).not.toHaveProperty("fiscalDiagnostic");
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it.each([
    ["CAE_INVALID", { CAE: "https://qr.test/7123456789012x" }],
    ["FISCAL_FIELDS_INCOMPLETE", "71234567890123"],
    ["FISCAL_TYPE_UNSUPPORTED", "71234567890123"],
  ] as const)("exposes a serializable diagnostic for %s and no actionable context", (reason, cae) => {
    const state = mapOrderToBillState(order({ CAE: { CAE: cae }, ...(reason === "FISCAL_FIELDS_INCOMPLETE" ? { invoiceNumber: undefined } : {}), ...(reason === "FISCAL_TYPE_UNSUPPORTED" ? { billType: "Remito" } : {}) }) as never) as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty("fiscalContext");
    expect(state.fiscalDiagnostic).toEqual({
      status: "INVALID_OR_INCOMPLETE",
      reason,
      message: expect.any(String),
    });
    expect(JSON.parse(JSON.stringify(state.fiscalDiagnostic))).toEqual(state.fiscalDiagnostic);
  });

  it("creates canonical context only for a valid sale and makes eligibility depend on content", () => {
    const state = mapOrderToBillState(order({ CAE: { CAE: "71234567890123" } }) as never) as unknown as Record<string, unknown>;
    expect(state.fiscalContext).toMatchObject({
      originalCAE: "71234567890123",
      invoiceNumber: 42,
      invoicePointOfSale: 7,
      eligibleForFullCreditNote: true,
    });
    expect(state).not.toHaveProperty("fiscalDiagnostic");
  });

  it("reports authorized and incomplete-content valid sales as INELIGIBLE", () => {
    const authorized = mapOrderToBillState(order({ CAE: { CAE: "71234567890123" }, returns: [{ kind: "CREDIT_NOTE", status: "AUTHORIZED" }] }) as never) as unknown as Record<string, unknown>;
    expect(authorized.fiscalDiagnostic).toMatchObject({ status: "INELIGIBLE", reason: "ALREADY_AUTHORIZED", message: expect.any(String) });

    const incomplete = mapOrderToBillState(order({ CAE: { CAE: "71234567890123" }, items: [] }) as never) as unknown as Record<string, unknown>;
    expect(incomplete.fiscalDiagnostic).toMatchObject({ status: "INELIGIBLE", reason: "SALE_CONTENT_INCOMPLETE", message: expect.any(String) });
  });
});
