import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillContext } from "@/context/BillContext";
import BillParametersForm from "@/components/Billing/BillParametersForm";
import type BillState from "@/models/BillState";

vi.mock("@/actions/voucher", () => ({ getVoucherNumberAction: vi.fn().mockResolvedValue({ success: 1 }) }));
vi.mock("@/actions/business", () => ({ getBusinessBillingInfoAction: vi.fn() }));
vi.mock("@/components/ui/form", () => ({
  Form: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: ({ render: renderField }: { render: (args: { field: Record<string, unknown> }) => React.ReactNode }) =>
    <>{renderField({ field: { value: "", onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() } })}</>,
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));
vi.mock("@/components/ui/input", () => ({ Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));
vi.mock("@/components/ui/checkbox", () => ({ Checkbox: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));
vi.mock("@/components/ui/button", () => ({ Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} /> }));

describe("BillParametersForm reset callback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resets only form/UI references and never dispatches a stale setState snapshot", async () => {
    const dispatch = vi.fn();
    const onOrderResetRef = { current: null as (() => void) | null };
    const billState = {
      id: "old-order",
      products: [{ id: "old-product", salePrice: 100, amount: 1 }],
      total: 100,
      totalWithDiscount: 90,
      discount: 10,
      seller: "seller",
      typeDocument: "DNI",
      documentNumber: 1,
      IVACondition: "Consumidor Final",
      paidMethod: "Transferencia",
      twoMethods: true,
      totalSecondMethod: 40,
      billType: "Factura A",
      ptoVenta: 99,
      date: new Date("2026-01-01T00:00:00.000Z"),
      CAE: { CAE: "123", nroComprobante: 1, vencimiento: "2026", qrData: "qr" },
    };

    render(
      <BillContext.Provider value={{
        BillState: billState as unknown as BillState,
        dispatch,
        addItem: vi.fn(),
        removeItem: vi.fn(),
        onOrderResetRef,
        initialBillType: "Factura B",
        billTypeRef: { current: "Factura A" },
        printMode: "thermal",
        setPrintMode: vi.fn(),
      }}>
        <BillParametersForm ptoVentas={[12]} initialBillType="Factura B" />
      </BillContext.Provider>,
    );

    await waitFor(() => expect(onOrderResetRef.current).toEqual(expect.any(Function)));
    // Ignore mount-time synchronization; this assertion is specifically about
    // the callback installed for a completed checkout.
    dispatch.mockClear();
    await act(async () => {
      onOrderResetRef.current?.();
    });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "setState",
      payload: expect.objectContaining({ products: billState.products, CAE: billState.CAE }),
    }));
  });
});
