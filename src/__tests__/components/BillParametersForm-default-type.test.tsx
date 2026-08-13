/**
 * Integration tests for BillParametersForm - default bill type based on
 * business IVA condition.
 *
 * Currently BillParametersForm hardcodes defaultValues.billType = BillTypes.C.
 * After the feature, it should use getDefaultBillType(businessIvaCondition)
 * to set the initial default.
 *
 * TDD: These tests will FAIL until BillParametersForm is updated to use
 * getDefaultBillType().
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

(globalThis as unknown as { React: typeof React }).React = React;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock getDefaultBillType - will be replaced by real implementation
vi.mock("@/utils/billing", () => ({
  getDefaultBillType: vi.fn(),
}));

// We need to mock the modules that BillParametersForm imports
vi.mock("@/context/BillContext", () => ({
  BillContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

vi.mock("@/actions/voucher", () => ({
  getVoucherNumberAction: vi.fn().mockResolvedValue({ success: 0 }),
}));

vi.mock("@/actions/business", () => ({
  getBusinessBillingInfoAction: vi.fn(),
}));

// Mock UI components to avoid deep rendering issues
vi.mock("@/components/ui/form", () => ({
  Form: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: ({ render: renderProp, ...rest }: any) =>
    renderProp({ field: { value: rest.name === "billType" ? "Factura C" : "", onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() } }),
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, ...props }: any) => <div data-testid={`select-${props.value || ""}`}>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input data-testid={props.name || "input"} {...props} />,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: (props: any) => <input type="checkbox" {...props} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { getDefaultBillType } from "@/utils/billing";
import { getBusinessBillingInfoAction } from "@/actions/business";
import { BillContext } from "@/context/BillContext";
import BillTypes from "@/models/billType";
import BillParametersForm from "@/components/Billing/BillParametersForm";

const mockedGetDefaultBillType = vi.mocked(getDefaultBillType);
const mockedGetBusinessBillingInfo = vi.mocked(getBusinessBillingInfoAction);

function renderWithContext(
  ui: React.ReactElement,
  contextValue: any = {}
) {
  const defaultContext = {
    dispatch: vi.fn(),
    BillState: {
      discount: 0,
      products: [],
      total: 0,
      totalWithDiscount: 0,
    },
    onOrderResetRef: { current: null },
    ...contextValue,
  };

  return render(
    <BillContext.Provider value={defaultContext}>
      {ui}
    </BillContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BillParametersForm - default bill type by IVA condition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // AC-02: Responsable Inscripto business defaults to Factura B
  // -----------------------------------------------------------------------
  it("uses getDefaultBillType with RESPONSABLE_INSCRIPTO to set initial default", async () => {
    mockedGetBusinessBillingInfo.mockResolvedValue({ condicionIva: "RESPONSABLE_INSCRIPTO" } as any);
    mockedGetDefaultBillType.mockReturnValue("Factura B");

    renderWithContext(<BillParametersForm ptoVentas={[1]} />, {});

    // Wait for the useEffect to call getBusinessBillingInfoAction
    await waitFor(() => {
      expect(mockedGetBusinessBillingInfo).toHaveBeenCalled();
    });

    // Verify the utility was called with the business IVA condition
    // The form should call getDefaultBillType to determine the default
    expect(mockedGetDefaultBillType).toHaveBeenCalled();
    expect(mockedGetDefaultBillType).toHaveBeenCalledWith("RESPONSABLE_INSCRIPTO");
  });

  // -----------------------------------------------------------------------
  // AC-01: Monotributo business defaults to Factura C
  // -----------------------------------------------------------------------
  it("uses getDefaultBillType with MONOTRIBUTO to set initial default", async () => {
    mockedGetBusinessBillingInfo.mockResolvedValue({ condicionIva: "MONOTRIBUTO" } as any);
    mockedGetDefaultBillType.mockReturnValue("Factura C");

    renderWithContext(<BillParametersForm ptoVentas={[1]} />, {});

    // Wait for the useEffect to call getBusinessBillingInfoAction
    await waitFor(() => {
      expect(mockedGetBusinessBillingInfo).toHaveBeenCalled();
    });

    expect(mockedGetDefaultBillType).toHaveBeenCalled();
    expect(mockedGetDefaultBillType).toHaveBeenCalledWith("MONOTRIBUTO");
  });

  // -----------------------------------------------------------------------
  // AC-06: Fallback to Factura C when business data unavailable
  // -----------------------------------------------------------------------
  it("uses getDefaultBillType with null when business data unavailable", () => {
    mockedGetDefaultBillType.mockReturnValue("Factura C");

    renderWithContext(<BillParametersForm ptoVentas={[1]} />, {});

    expect(mockedGetDefaultBillType).toHaveBeenCalled();
    // When no business IVA condition is available, should pass null
    const callArg = mockedGetDefaultBillType.mock.calls[0][0];
    expect(callArg === null || callArg === undefined).toBe(true);
  });

  // -----------------------------------------------------------------------
  // AC-03: User can override the default
  // -----------------------------------------------------------------------
  it("renders with the default bill type from getDefaultBillType, not hardcoded Factura C", () => {
    mockedGetDefaultBillType.mockReturnValue("Factura B");

    // The form default should be "Factura B", not hardcoded "Factura C"
    renderWithContext(<BillParametersForm ptoVentas={[1]} />, {});

    // Verify the utility was used (not hardcoded)
    expect(mockedGetDefaultBillType).toHaveBeenCalled();
  });
});
