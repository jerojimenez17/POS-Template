import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BillContext } from "@/context/BillContext";
import PriceEditInput from "@/components/Billing/PriceEditInput";

const makeContext = (focusPriceProductId: string | null) => ({
  BillState: { products: [] },
  dispatch: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
  onOrderResetRef: { current: null },
  printMode: "thermal" as const,
  setPrintMode: vi.fn(),
  qzTrayActive: false,
  setQzTrayActive: vi.fn(),
  focusPriceProductId,
  setFocusPriceProductId: vi.fn(),
});

const renderInput = (
  productId: string,
  salePrice: number,
  focusPriceProductId: string | null,
) => {
  const context = makeContext(focusPriceProductId);
  const result = render(
    <BillContext.Provider value={context as any}>
      <PriceEditInput productId={productId} salePrice={salePrice} />
    </BillContext.Provider>,
  );
  return { ...result, context };
};

describe("PriceEditInput — solicitud de foco por productId", () => {
  it("enfoca el input, entra en edición y conserva el valor inicial", () => {
    renderInput("prod-f1", 0, "prod-f1");

    const input = screen.getByRole("textbox", {
      name: "Precio del producto prod-f1",
    });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("0");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });

  it("responde cuando el input se monta después de existir la solicitud", () => {
    const context = makeContext("prod-later");
    const { rerender } = render(
      <BillContext.Provider value={context as any}>
        <div data-testid="table" />
      </BillContext.Provider>,
    );

    rerender(
      <BillContext.Provider value={context as any}>
        <PriceEditInput productId="prod-later" salePrice={0} />
      </BillContext.Provider>,
    );

    expect(
      screen.getByRole("textbox", { name: "Precio del producto prod-later" }),
    ).toHaveFocus();
  });

  it("usa productId y no la posición entre productos", () => {
    const context = makeContext("prod-target");
    render(
      <BillContext.Provider value={context as any}>
        <div>
          <PriceEditInput productId="prod-z" salePrice={0} />
          <PriceEditInput productId="prod-target" salePrice={0} />
        </div>
      </BillContext.Provider>,
    );

    expect(
      screen.getByRole("textbox", { name: "Precio del producto prod-target" }),
    ).toHaveFocus();
    expect(
      screen.queryByRole("textbox", { name: "Precio del producto prod-z" }),
    ).not.toBeInTheDocument();
  });

  it("consume la solicitud una sola vez aunque cambie el precio después", () => {
    const context = makeContext("prod-once");
    const { rerender } = render(
      <BillContext.Provider value={context as any}>
        <PriceEditInput productId="prod-once" salePrice={0} />
      </BillContext.Provider>,
    );
    const firstInput = screen.getByRole("textbox", {
      name: "Precio del producto prod-once",
    });
    const focusSpy = vi.spyOn(firstInput, "focus");

    rerender(
      <BillContext.Provider value={context as any}>
        <PriceEditInput productId="prod-once" salePrice={10} />
      </BillContext.Provider>,
    );

    expect(focusSpy).not.toHaveBeenCalled();
    expect(context.setFocusPriceProductId).toHaveBeenCalledWith(null);
  });

  it("no entra en edición con una solicitud para otro producto", () => {
    const { context } = renderInput("prod-other", 25, "prod-target");

    expect(screen.getByRole("button", { name: "Precio del producto prod-other" }))
      .toBeInTheDocument();
    expect(context.setFocusPriceProductId).not.toHaveBeenCalled();
  });

  it("mantiene el flujo normal sin foco automático y permite edición explícita", () => {
    renderInput("prod-normal", 25, null);
    const priceButton = screen.getByRole("button", {
      name: "Precio del producto prod-normal",
    });
    expect(priceButton).toBeInTheDocument();

    fireEvent.click(priceButton);
    expect(
      screen.getByRole("textbox", { name: "Precio del producto prod-normal" }),
    ).toBeInTheDocument();
  });
});
