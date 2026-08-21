import { beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BillContext } from "@/context/BillContext";
import BillParametersForm from "@/components/Billing/BillParametersForm";
import BillTypes from "@/models/billType";

vi.mock("@/actions/voucher", () => ({ getVoucherNumberAction: vi.fn() }));
import { getVoucherNumberAction } from "@/actions/voucher";

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value?: string | number; onValueChange?: (value: string) => void }) => (
    <select data-testid="bill-select" value={value === undefined ? "" : String(value)} onChange={(event) => onValueChange?.(event.target.value)}>{children}</select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));
vi.mock("@/components/ui/input", () => ({ Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));
vi.mock("@/components/ui/checkbox", () => ({ Checkbox: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) => <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} /> }));

const billState = {
  id: "", products: [], total: 0, totalWithDiscount: 0, seller: "seller", discount: 0, date: new Date(), typeDocument: "Consumidor Final", documentNumber: 0, IVACondition: "Consumidor Final", twoMethods: false,
};

function renderForm(dispatch = vi.fn(), initialBillType = BillTypes.B) {
  const onOrderResetRef = { current: null } as React.MutableRefObject<(() => void) | null>;
  return { dispatch, onOrderResetRef, ...render(<BillContext.Provider value={{ BillState: billState, dispatch, addItem: vi.fn(), removeItem: vi.fn(), onOrderResetRef, initialBillType, billTypeRef: { current: initialBillType }, printMode: "thermal", setPrintMode: vi.fn() }}><BillParametersForm ptoVentas={[1, 2]} initialBillType={initialBillType} /></BillContext.Provider>) };
}

describe("BillParametersForm point-sale snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVoucherNumberAction).mockResolvedValue({ success: 10 });
  });

  it("updates the emission snapshot immediately when point changes, without saving", async () => {
    const dispatch = vi.fn();
    renderForm(dispatch);
    fireEvent.click(screen.getByText(BillTypes.B));
    const selects = screen.getAllByTestId("bill-select");
    fireEvent.change(selects[1], { target: { value: "2" } });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "setState", payload: expect.objectContaining({ ptoVenta: 2 }) }));
  });

  it.each([[BillTypes.A, 1], [BillTypes.B, 6], [BillTypes.C, 11]] as const)("keeps %s aligned in context and numbering query", async (billType, code) => {
    const dispatch = vi.fn();
    renderForm(dispatch);
    fireEvent.click(screen.getByText(BillTypes.B));
    fireEvent.change(screen.getAllByTestId("bill-select")[0], { target: { value: billType } });
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "billType", payload: billType }));
    expect(getVoucherNumberAction).toHaveBeenCalledWith(1, code);
  });

  it("ignores an out-of-order response from a previous point/type pair", async () => {
    let resolveFirst!: (result: { success: number }) => void;
    let resolveSecond!: (result: { success: number }) => void;
    vi.mocked(getVoucherNumberAction)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    renderForm();
    fireEvent.click(screen.getByText(BillTypes.B));
    fireEvent.change(screen.getAllByTestId("bill-select")[1], { target: { value: "2" } });
    resolveSecond({ success: 200 });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByText("0201")).toBeInTheDocument());
    resolveFirst({ success: 100 });
    await waitFor(() => expect(screen.getByText("0201")).toBeInTheDocument());
    expect(screen.queryByText("0101")).not.toBeInTheDocument();
  });

  it("reset restores the first point and the initial invoice type", async () => {
    const { onOrderResetRef, dispatch } = renderForm();
    fireEvent.click(screen.getByText(BillTypes.B));
    fireEvent.change(screen.getAllByTestId("bill-select")[1], { target: { value: "2" } });
    onOrderResetRef.current?.();
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "billType", payload: BillTypes.B }));
    expect(getVoucherNumberAction).toHaveBeenCalledWith(1, 6);
  });
});
