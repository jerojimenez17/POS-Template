import { describe, expect, it, vi } from "vitest";
import { mapOrderToBillState } from "@/actions/sales/history";

const baseOrder = (overrides: Record<string, unknown> = {}) => ({
  id: "historic-order", CAE: JSON.stringify({ CAE: "71234567890123", qrData: "qr", billType: "Factura B", afipVoucherType: 6, nroComprobante: 42, ptoVenta: 7 }),
  billType: undefined, afipVoucherType: undefined, invoiceNumber: undefined, invoicePointOfSale: undefined,
  total: 1200, discountAmount: 0, date: new Date("2026-01-01"),
  items: [{ id: "item-1", productId: "product-1", code: "P1", description: "Producto", price: 1200, costPrice: 900, quantity: 1 }],
  client: null, clientId: null, seller: "seller", discountPercentage: 0, paymentMethod: "Efectivo", paymentMethod2: null, totalMethod2: null,
  clientIvaCondition: "Consumidor Final", clientDocumentNumber: null, clientDocumentType: null, returns: [], ...overrides,
});

describe("credit-note historical mapper contract", () => {
  it("creates serializable fiscalContext only for a valid historical JSON sale", () => {
    const state = mapOrderToBillState(baseOrder() as never) as unknown as Record<string, unknown>;
    expect(state.fiscalContext).toMatchObject({ billType: "Factura B", originalAfipVoucherType: 6, originalCAE: "71234567890123", invoiceNumber: 42, invoicePointOfSale: 7, eligibleForFullCreditNote: true });
    expect(state).not.toHaveProperty("fiscalDiagnostic");
    expect(JSON.stringify(state.fiscalContext)).not.toMatch(/qrData|71234567890123.*qr/);
  });

  it("reproduces the missing-type log fixture as diagnostic and no context", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const state = mapOrderToBillState(baseOrder({ CAE: JSON.stringify({ CAE: "71234567890123", qrData: "qr" }), invoiceNumber: 42, invoicePointOfSale: 7 }) as never) as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty("fiscalContext");
    expect(state.fiscalDiagnostic).toEqual({ status: "INVALID_OR_INCOMPLETE", reason: "FISCAL_FIELDS_INCOMPLETE", message: expect.any(String) });
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ source: "historical_json", hasCaeSignal: true, hasValidCae: false, hasInvoiceNumber: true, hasPointOfSale: true, hasBillType: false, hasVoucherType: false }));
    info.mockRestore();
  });

  it("keeps manual sales silent and preserves pending, authorized, and rejected return policy", () => {
    const manual = mapOrderToBillState(baseOrder({ CAE: null, billType: undefined, afipVoucherType: undefined }) as never) as unknown as Record<string, unknown>;
    expect(manual).not.toHaveProperty("fiscalContext");
    expect(manual).not.toHaveProperty("fiscalDiagnostic");
    for (const status of ["PENDING", "REJECTED"] as const) {
      const state = mapOrderToBillState(baseOrder({ returns: [{ kind: "CREDIT_NOTE", status }] }) as never) as unknown as Record<string, unknown>;
      expect(state.fiscalContext).toMatchObject({ creditNote: { status }, eligibleForFullCreditNote: true });
    }
    const authorized = mapOrderToBillState(baseOrder({ returns: [{ kind: "CREDIT_NOTE", status: "AUTHORIZED" }] }) as never) as unknown as Record<string, unknown>;
    expect(authorized.fiscalContext).toMatchObject({ eligibleForFullCreditNote: false });
    expect(authorized.fiscalDiagnostic).toMatchObject({ status: "INELIGIBLE", reason: "ALREADY_AUTHORIZED" });
  });
});
