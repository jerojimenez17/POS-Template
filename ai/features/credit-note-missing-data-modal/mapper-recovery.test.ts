import { describe, expect, it, vi } from "vitest";
import { mapOrderToBillState } from "@/actions/sales/history";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "historical-1", CAE: { CAE: "71234567890123" }, billType: "Factura B", afipVoucherType: 6,
  invoiceNumber: 42, invoicePointOfSale: 7, total: 1200, discountAmount: 0,
  date: new Date("2026-01-01"), items: [{ id: "item-1", productId: "p-1", code: "P1", description: "Producto", price: 1200, costPrice: 900, quantity: 1 }],
  client: null, clientId: null, seller: "seller", discountPercentage: 0, paymentMethod: "Efectivo", paymentMethod2: null, totalMethod2: null,
  clientIvaCondition: "Consumidor Final", clientDocumentNumber: null, clientDocumentType: null, ...overrides,
});

describe("credit-note recovery DTO mapping (RED)", () => {
  it("adds a safe recovery DTO for a CAE-valid sale missing only billType", () => {
    const state = mapOrderToBillState(order({ billType: undefined, afipVoucherType: undefined }) as never) as unknown as Record<string, unknown>;
    expect(state.creditNoteRecovery).toEqual({
      orderId: "historical-1", missingFields: ["billType"], known: { invoiceNumber: 42, invoicePointOfSale: 7 },
      total: 1200, products: expect.any(Array), creditNoteStatus: null,
    });
  });

  it("does not serialize CAE JSON, QR data, credentials, or arbitrary order fields", () => {
    const state = mapOrderToBillState(order({ CAE: { CAE: "71234567890123", qr: "secret" }, password: "secret" }) as never) as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty("creditNoteRecovery");
    expect(state.creditNoteRecovery).toBeUndefined();
    const recoveryJson = JSON.stringify(state.creditNoteRecovery ?? null);
    expect(recoveryJson).not.toMatch(/71234567890123|secret|qr/i);
  });

  it("does not expose recovery DTO for invalid CAE or manual sales", () => {
    expect(mapOrderToBillState(order({ CAE: { CAE: "bad" } }) as never)).not.toHaveProperty("creditNoteRecovery");
    expect(mapOrderToBillState(order({ CAE: null }) as never)).not.toHaveProperty("creditNoteRecovery");
  });

  it("keeps known persisted fields read-only and never infers missingFields in React", () => {
    const state = mapOrderToBillState(order({ billType: undefined, afipVoucherType: undefined }) as never) as unknown as Record<string, unknown>;
    expect(state.creditNoteRecovery).toHaveProperty("known");
    expect(state.creditNoteRecovery).toHaveProperty("missingFields");
  });
});
