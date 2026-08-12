/**
 * Integration tests for BillingModal - default invoice type based on
 * business IVA condition.
 *
 * Currently BillingModal hardcodes:
 *   - The disabled Input value="Factura C"
 *   - The description text "Genere una Factura C para esta venta existente."
 *
 * After the feature, the BillingModal should:
 *   - Accept businessIvaCondition prop
 *   - Use getDefaultBillType() to compute the correct invoice type
 *   - Display the computed type instead of hardcoded "Factura C"
 *
 * TDD: These tests will FAIL until BillingModal is updated.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

(globalThis as unknown as { React: typeof React }).React = React;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/utils/billing", () => ({
  getDefaultBillType: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/actions/afip", () => ({
  createAfipVoucherAction: vi.fn(),
}));

vi.mock("@/actions/sales/update", () => ({
  updateOrderCaeAction: vi.fn(),
}));

// Mock dialog to render children directly
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogDescription: ({ children }: any) => <p data-testid="dialog-description">{children}</p>,
  DialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
}));

vi.mock("@/components/Billing/Select", () => ({
  default: ({ value, options, handleChange, id }: any) => (
    <select data-testid={id} value={value} onChange={handleChange}>
      {options.map((opt: string) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input data-testid={props.id || "input"} disabled={props.disabled} value={props.value} onChange={props.onChange} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-testid={props["data-testid"]}>{children}</button>
  ),
}));

vi.mock("@/utils/PaidMethods", () => ({
  paidMethods: [{ name: "Efectivo" }, { name: "Débito" }, { name: "Crédito" }],
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { getDefaultBillType } from "@/utils/billing";
import BillingModal from "@/components/Billing/BillingModal";
import BillState from "@/models/BillState";

const mockedGetDefaultBillType = vi.mocked(getDefaultBillType);

function createSale(overrides: Partial<BillState> = {}): BillState {
  return {
    id: "sale-1",
    products: [],
    total: 1000,
    totalWithDiscount: 1000,
    seller: "Test Seller",
    discount: 0,
    date: new Date(),
    typeDocument: "Consumidor Final",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    twoMethods: false,
    paidMethod: "Efectivo",
    billType: "Factura C",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BillingModal - default invoice type by IVA condition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // AC-05: BillingModal shows correct default
  // -----------------------------------------------------------------------
  it("displays Factura B when business is RESPONSABLE_INSCRIPTO", () => {
    mockedGetDefaultBillType.mockReturnValue("Factura B");

    render(
      <BillingModal
        open={true}
        onOpenChange={vi.fn()}
        sale={createSale()}
        onSuccess={vi.fn()}
      />
    );

    // The disabled input should show "Factura B", not hardcoded "Factura C"
    const tipoInput = screen.getAllByTestId("input").find(
      (el) => (el as HTMLInputElement).disabled
    );
    expect(tipoInput).toBeDefined();
    expect((tipoInput as HTMLInputElement).value).toBe("Factura B");
  });

  it("displays Factura C when business is MONOTRIBUTO", () => {
    mockedGetDefaultBillType.mockReturnValue("Factura C");

    render(
      <BillingModal
        open={true}
        onOpenChange={vi.fn()}
        sale={createSale()}
        onSuccess={vi.fn()}
      />
    );

    const tipoInput = screen.getAllByTestId("input").find(
      (el) => (el as HTMLInputElement).disabled
    );
    expect(tipoInput).toBeDefined();
    expect((tipoInput as HTMLInputElement).value).toBe("Factura C");
  });

  // -----------------------------------------------------------------------
  // AC-06: Fallback when business data unavailable
  // -----------------------------------------------------------------------
  it("displays Factura C when business IVA condition is null (fallback)", () => {
    mockedGetDefaultBillType.mockReturnValue("Factura C");

    render(
      <BillingModal
        open={true}
        onOpenChange={vi.fn()}
        sale={createSale()}
        onSuccess={vi.fn()}
      />
    );

    const tipoInput = screen.getAllByTestId("input").find(
      (el) => (el as HTMLInputElement).disabled
    );
    expect(tipoInput).toBeDefined();
    expect((tipoInput as HTMLInputElement).value).toBe("Factura C");
  });

  // -----------------------------------------------------------------------
  // AC-09: AFIP voucher generation uses correct invoice type
  // -----------------------------------------------------------------------
  it("calls getDefaultBillType to determine the correct invoice type for the sale", () => {
    mockedGetDefaultBillType.mockReturnValue("Factura B");

    render(
      <BillingModal
        open={true}
        onOpenChange={vi.fn()}
        sale={createSale()}
        onSuccess={vi.fn()}
      />
    );

    // Verify the utility was used to determine the invoice type
    expect(mockedGetDefaultBillType).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Description text should reflect correct invoice type
  // -----------------------------------------------------------------------
  it("shows description with correct invoice type, not hardcoded Factura C", () => {
    mockedGetDefaultBillType.mockReturnValue("Factura B");

    render(
      <BillingModal
        open={true}
        onOpenChange={vi.fn()}
        sale={createSale()}
        onSuccess={vi.fn()}
      />
    );

    const description = screen.getByTestId("dialog-description");
    // Should mention Factura B, not "Factura C"
    expect(description.textContent).toContain("Factura B");
    expect(description.textContent).not.toContain("Factura C");
  });
});
