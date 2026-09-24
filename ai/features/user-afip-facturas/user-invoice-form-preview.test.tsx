import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useController } from "react-hook-form";

import BillProvider from "@/context/BillProvider";
import BillParametersForm from "@/components/Billing/BillParametersForm";
import { getVoucherNumberAction } from "@/actions/voucher";
import { getBusinessBillingInfoAction } from "@/actions/business";

vi.mock("@/actions/voucher", () => ({ getVoucherNumberAction: vi.fn() }));
vi.mock("@/actions/business", () => ({ getBusinessBillingInfoAction: vi.fn() }));

vi.mock("@/components/ui/form", () => ({
  Form: (props: { children: React.ReactNode } & Record<string, unknown>) => {
    const { children, ...form } = props;
    return <FormProvider {...(form as Parameters<typeof FormProvider>[0])}>{children}</FormProvider>;
  },
  FormField: ({ name, control, render: renderField }: {
    name: string;
    control: Parameters<typeof useController>[0]["control"];
    render: (args: ReturnType<typeof useController>) => React.ReactNode;
  }) => {
    const controller = useController({ name, control });
    return <>{renderField(controller)}</>;
  },
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, name }: {
    children: React.ReactNode;
    value?: string;
    name?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <select
      aria-label={name === "billType" ? "Tipo" : "Punto de venta"}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder}</>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input type="checkbox" {...props} />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

const voucherActionMock = vi.mocked(getVoucherNumberAction);
const businessInfoActionMock = vi.mocked(getBusinessBillingInfoAction);

function renderInvoiceForm(ptoVentas: number[] = [3], initialBillType = "Factura B") {
  return render(
    <BillProvider initialBillType={initialBillType}>
      <BillParametersForm initialBillType={initialBillType} ptoVentas={ptoVentas} />
    </BillProvider>,
  );
}

describe("USER invoice-number preview form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    businessInfoActionMock.mockRejectedValue(new Error("Business info is supplied by the server page"));
    voucherActionMock.mockResolvedValue({ success: 76 });
  });

  it("shows lastVoucher + 1 beside the matching configured POS and invoice type", async () => {
    renderInvoiceForm([3], "Factura B");

    const nextNumber = await screen.findByText("0077");
    expect(nextNumber.parentElement).toHaveTextContent("003-0077");
    expect(screen.getByText("Factura B")).toBeInTheDocument();
    expect(voucherActionMock).toHaveBeenCalledWith(3, 6);
  });

  it("clears a stale number and shows a visible preview-specific returned error without claiming CAE rejection", async () => {
    renderInvoiceForm();

    expect(await screen.findByText("0077")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Editar" }));
    voucherActionMock.mockResolvedValueOnce({ error: "No se pudo consultar la numeración" });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "Factura C" } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(voucherActionMock).toHaveBeenCalledWith(3, 11));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/numeraci[oó]n|n[uú]mero|vista previa|previsualizaci[oó]n/i);
    expect(alert).not.toHaveTextContent(/CAE|rechaz/i);
    expect(screen.queryByText("0077")).not.toBeInTheDocument();
  });

  it("ends the pending preview state and shows a safe message when the action rejects", async () => {
    voucherActionMock.mockRejectedValue(new Error("sensitive-upstream-detail"));

    renderInvoiceForm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/numeraci[oó]n|n[uú]mero|vista previa|previsualizaci[oó]n/i);
    expect(alert).not.toHaveTextContent(/sensitive-upstream-detail|CAE|rechaz/i);
    expect(screen.queryByText("...")).not.toBeInTheDocument();
  });

  it("reports a missing configured POS and does not request a voucher number", async () => {
    renderInvoiceForm([]);

    expect(voucherActionMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/numeraci[oó]n|n[uú]mero|punto de venta/i);
  });

  it("allows only the latest selection request to update the displayed number", async () => {
    let resolveInitial!: (value: { success: number }) => void;
    const initialRequest = new Promise<{ success: number }>((resolve) => {
      resolveInitial = resolve;
    });
    voucherActionMock.mockReturnValueOnce(initialRequest);

    renderInvoiceForm([3], "Factura B");
    await waitFor(() => expect(voucherActionMock).toHaveBeenCalledWith(3, 6));

    await userEvent.setup().click(screen.getByRole("button", { name: "Editar" }));
    voucherActionMock.mockResolvedValueOnce({ success: 90 });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "Factura C" } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(voucherActionMock).toHaveBeenCalledWith(3, 11));
    expect(await screen.findByText("0091")).toBeInTheDocument();

    resolveInitial({ success: 12 });

    await waitFor(() => {
      expect(screen.getByText("0091")).toBeInTheDocument();
      expect(screen.queryByText("0013")).not.toBeInTheDocument();
    });
  });
});
