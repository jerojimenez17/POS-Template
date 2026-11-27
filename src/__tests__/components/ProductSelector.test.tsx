import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProductSelector from "@/components/catalog/product-selector";
import { CartContext } from "@/components/catalog/context/CartContext";
import { PublicProduct } from "@/actions/catalog";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

/* eslint-disable @next/next/no-img-element */
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img alt="" {...props} />,
}));
/* eslint-enable @next/next/no-img-element */

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

const addItem = vi.fn();

const cartContext = {
  cartState: {
    id: "",
    products: [],
    total: 0,
    date: new Date(),
    status: "pendiente" as const,
    paidStatus: "inpago" as const,
    businessId: "biz-1",
  },
  addItem,
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

const products: PublicProduct[] = [
  {
    id: "p1",
    code: "FIA-001",
    description: "Jamón cocido natural 250 g",
    brand: "Cagnoli",
    category: "Fiambres y Quesos",
    salePrice: 6450,
    unit: "unidad",
    image: null,
    images: [],
    amount: 20,
    details: "Fiambre.",
  },
  {
    id: "p2",
    code: "BEB-001",
    description: "Gaseosa cola 1.5 L",
    brand: "Coca-Cola",
    category: "Bebidas",
    salePrice: 3200,
    unit: "unidad",
    image: null,
    images: [],
    amount: 30,
    details: "Bebida.",
  },
  {
    id: "p3",
    code: "LAC-001",
    description: "Queso cremoso 500 g",
    brand: "La Paulina",
    category: "Lácteos y Huevos",
    salePrice: 4500,
    unit: "unidad",
    image: null,
    images: [],
    amount: 15,
    details: "Lácteo.",
  },
];

function renderSelector() {
  return render(
    <CartContext.Provider value={cartContext}>
      <ProductSelector
        products={products}
        business={{ name: "Mi Negocio", logo: null }}
        businessSlug="mi-negocio"
      />
    </CartContext.Provider>,
  );
}

describe("ProductSelector catálogo público", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("busca sin distinguir acentos y filtra por categoría", async () => {
    renderSelector();

    const search = screen.getByRole("searchbox", { name: "Buscar productos" });
    fireEvent.change(search, { target: { value: "jamon" } });

    await waitFor(() => {
      expect(screen.getByText("Jamón cocido natural 250 g")).toBeInTheDocument();
      expect(screen.queryByText("Gaseosa cola 1.5 L")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Bebidas/ }));
    fireEvent.change(search, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.getByText("Gaseosa cola 1.5 L")).toBeInTheDocument();
      expect(screen.queryByText("Jamón cocido natural 250 g")).not.toBeInTheDocument();
      expect(screen.queryByText("Queso cremoso 500 g")).not.toBeInTheDocument();
    });
  });

  it("agrega al carrito desde la tarjeta del producto", () => {
    renderSelector();

    fireEvent.click(screen.getByRole("button", { name: /agregar gaseosa cola 1\.5 l al carrito/i }));

    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p2", description: "Gaseosa cola 1.5 L", amount: 1 }),
    );
  });
});
