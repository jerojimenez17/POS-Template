import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BillContext } from "@/context/BillContext";
import type BillContextProps from "@/context/BillContext";
import PriceEditInput from "@/components/Billing/PriceEditInput";
import BillState from "@/models/BillState";

function renderPriceInput() {
  const dispatch = vi.fn<BillContextProps["dispatch"]>();
  const billState: BillState = {
    id: "bill-1",
    products: [],
    total: 0,
    totalWithDiscount: 0,
    seller: "",
    discount: 0,
    date: new Date("2026-01-01"),
    typeDocument: "DNI",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    twoMethods: false,
  };
  const context: BillContextProps = {
    BillState: billState,
    dispatch,
    addItem: vi.fn(),
    removeItem: vi.fn(),
    onOrderResetRef: { current: null },
    printMode: "thermal",
    setPrintMode: vi.fn(),
    focusPriceProductId: null,
  };

  render(
    <BillContext.Provider value={context}>
      <PriceEditInput productId="shortcut-f1" salePrice={0} />
    </BillContext.Provider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Precio del producto shortcut-f1" }));
  return { dispatch, input: screen.getByRole("textbox", { name: "Precio del producto shortcut-f1" }) };
}

describe("PriceEditInput price confirmation", () => {
  it("dispatches updateSalePrice with the normalized number on blur", () => {
    const { dispatch, input } = renderPriceInput();

    fireEvent.change(input, { target: { value: "125,50" } });
    fireEvent.blur(input);

    expect(dispatch).toHaveBeenCalledWith({
      type: "updateSalePrice",
      payload: { id: "shortcut-f1", salePrice: 125.5 },
    });
  });

  it("dispatches updateSalePrice with the same value on Enter", () => {
    const { dispatch, input } = renderPriceInput();

    fireEvent.change(input, { target: { value: "125.50" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "updateSalePrice",
      payload: { id: "shortcut-f1", salePrice: 125.5 },
    });
  });
});
