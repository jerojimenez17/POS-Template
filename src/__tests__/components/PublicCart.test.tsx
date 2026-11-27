import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicCart } from "@/components/catalog/public-cart";
import { CartContext } from "@/components/catalog/context/CartContext";
import Product from "@/models/Product";

vi.mock("@/components/catalog/checkout-form", () => ({
  CheckoutForm: () => <div data-testid="checkout-form" />,
}));

const product = new Product();
product.id = "prod-1";
product.description = "Jamón cocido natural 250 g";
product.salePrice = 6450;
product.price = 6450;
product.amount = 2;

const cartContext = {
  cartState: {
    id: "",
    products: [product],
    total: 12900,
    date: new Date(),
    status: "pendiente" as const,
    paidStatus: "inpago" as const,
    businessId: "biz-1",
  },
  addItem: vi.fn(),
  addUnit: vi.fn(),
  removeUnit: vi.fn(),
  removeAll: vi.fn(),
  removeItem: vi.fn(),
  changePrice: vi.fn(),
  changeAmount: vi.fn(),
  total: vi.fn(),
  discount: vi.fn(),
  entrega: vi.fn(),
  setState: vi.fn(),
};

describe("PublicCart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra solo el badge de cantidad en el FAB", () => {
    render(
      <CartContext.Provider value={cartContext}>
        <PublicCart businessId="biz-1" />
      </CartContext.Provider>,
    );

    const trigger = screen.getByRole("button", { name: /abrir carrito, 2 productos/i });
    expect(trigger).toHaveTextContent("2");
    expect(trigger).not.toHaveTextContent("Carrito");
    expect(trigger).not.toHaveTextContent("$");
  });

  it("usa Comprar en el carrito y mantiene Vaciar y Comprar del mismo tamaño", () => {
    render(
      <CartContext.Provider value={cartContext}>
        <PublicCart businessId="biz-1" />
      </CartContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /abrir carrito/i }));

    const vaciar = screen.getByRole("button", { name: "Vaciar" });
    const comprar = screen.getByRole("button", { name: "Comprar" });

    expect(comprar).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continuar al pago/i })).not.toBeInTheDocument();
    expect(vaciar).toHaveClass("h-11", "w-full");
    expect(comprar).toHaveClass("h-11", "w-full");
  });

  it("pide confirmación antes de eliminar un producto", async () => {
    render(
      <CartContext.Provider value={cartContext}>
        <PublicCart businessId="biz-1" />
      </CartContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /abrir carrito/i }));
    fireEvent.click(screen.getByRole("button", { name: /eliminar jamón cocido natural 250 g del carrito/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Eliminar producto")).toBeInTheDocument();
    expect(cartContext.removeItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(cartContext.removeItem).toHaveBeenCalledWith(product);
  });
});
