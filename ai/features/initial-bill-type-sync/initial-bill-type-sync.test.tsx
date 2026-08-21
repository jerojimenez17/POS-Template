/**
 * TDD contract for the initial invoice type synchronization.
 *
 * These tests intentionally exercise public component behavior rather than
 * reducer implementation details. They are RED until the feature is wired
 * end-to-end.
 */
import React, { useContext } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useController } from "react-hook-form";

import BillProvider from "@/context/BillProvider";
import { BillContext } from "@/context/BillContext";
import BillParametersForm from "@/components/Billing/BillParametersForm";
import { getBusinessBillingInfoAction } from "@/actions/business";
import { getVoucherNumberAction } from "@/actions/voucher";

vi.mock("@/actions/business", () => ({
  getBusinessBillingInfoAction: vi.fn(),
}));

vi.mock("@/actions/voucher", () => ({
  getVoucherNumberAction: vi.fn().mockResolvedValue({ success: 0 }),
}));

// Keep this suite focused on the contract and avoid Radix portal behavior.
vi.mock("@/components/ui/form", () => ({
  Form: (props: { children: React.ReactNode } & Record<string, unknown>) => {
    const { children, ...form } = props;
    return <FormProvider {...(form as Parameters<typeof FormProvider>[0])}>{children}</FormProvider>;
  },
  FormField: ({ name, control, render: renderField }: { name: string; control: Parameters<typeof useController>[0]["control"]; render: (args: ReturnType<typeof useController>) => React.ReactNode }) => {
    const controller = useController({ name, control });
    return <>{renderField(controller)}</>;
  },
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value?: string; onValueChange?: (value: string) => void }) => (
    <select aria-label="Tipo" value={value} onChange={(event) => onValueChange?.(event.target.value)}>{children}</select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder}</>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("@/components/ui/checkbox", () => ({ Checkbox: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input type="checkbox" {...props} /> }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

const mockedBusinessInfo = vi.mocked(getBusinessBillingInfoAction);
const mockedVoucher = vi.mocked(getVoucherNumberAction);

function ContextProbe() {
  const context = useContext(BillContext);
  return <output data-testid="context-bill-type">{context.BillState.billType}</output>;
}

describe("initial bill type synchronization (CA-01, CA-02, CA-07)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessInfo.mockRejectedValue(new Error("client lookup must not choose the initial type"));
    mockedVoucher.mockResolvedValue({ success: 0 });
  });

  it("initializes a new invoice as Factura B in provider state on the first render", () => {
    render(
      <BillProvider initialBillType="Factura B">
        <ContextProbe />
      </BillProvider>,
    );

    expect(screen.getByTestId("context-bill-type")).toHaveTextContent("Factura B");
  });

  it("uses Factura C, never Remito, when a new invoice has no explicit default", () => {
    render(
      <BillProvider>
        <ContextProbe />
      </BillProvider>,
    );

    expect(screen.getByTestId("context-bill-type")).toHaveTextContent("Factura C");
  });

  it("does not perform a second client business lookup to decide the form default", async () => {
    render(
      <BillProvider initialBillType="Factura B">
        <BillParametersForm initialBillType="Factura B" ptoVentas={[1]} />
      </BillProvider>,
    );

    expect(screen.getByText("Factura B")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedBusinessInfo).not.toHaveBeenCalled();
  });

  it("does not render a contradictory hidden Factura C input when the visible type is B", async () => {
    render(
      <BillProvider initialBillType="Factura B">
        <BillParametersForm initialBillType="Factura B" ptoVentas={[]} />
      </BillProvider>,
    );

    await (async () => {
      await import("@testing-library/user-event").then(async ({ default: userEvent }) => {
        await userEvent.setup().click(screen.getByRole("button", { name: "Editar" }));
      });
    })();

    expect(screen.queryByDisplayValue("Factura C")).not.toBeInTheDocument();
  });
});

describe("initial voucher lookup mapping (CA-08)", () => {
  it.each([
    ["Factura A", 1],
    ["Factura B", 6],
    ["Factura C", 11],
  ])("uses AFIP code %s → %s for the first lookup", async (billType, expectedCode) => {
    mockedBusinessInfo.mockRejectedValue(new Error("no duplicate default lookup"));
    mockedVoucher.mockResolvedValue({ success: 0 });

    render(
      <BillProvider initialBillType={billType}>
        <BillParametersForm initialBillType={billType} ptoVentas={[7]} />
      </BillProvider>,
    );

    await waitFor(() => expect(mockedVoucher).toHaveBeenCalledWith(7, expectedCode));
  });
});
