import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProductCard from "@/components/catalog/ProductCard";
import { PublicProduct } from "@/actions/catalog";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

/* eslint-disable @next/next/no-img-element */
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img alt="" {...props} />,
}));
/* eslint-enable @next/next/no-img-element */

const mockProduct: PublicProduct = {
  id: "prod-1",
  code: "P001",
  description: "Jamón cocido natural 250 g",
  brand: "Cagnoli",
  category: "Fiambres y Quesos",
  salePrice: 6450,
  unit: "unidad",
  image: null,
  images: [],
  amount: 10,
  details: "Fiambre para picadas.",
};

const defaultProps = {
  product: mockProduct,
  cartQuantity: 0,
  onAddToCart: vi.fn(),
  businessSlug: "mi-negocio",
};

describe("ProductCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra la información relevante del producto y no expone el código", () => {
    render(<ProductCard {...defaultProps} />);

    expect(screen.getByText("Jamón cocido natural 250 g")).toBeInTheDocument();
    expect(screen.getByText("Cagnoli")).toBeInTheDocument();
    expect(screen.getByText("Fiambres y Quesos")).toBeInTheDocument();
    expect(screen.getAllByText(/\$\s?6\.450/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/P001/)).not.toBeInTheDocument();
  });

  it("agrega una unidad al carrito desde la card", () => {
    render(<ProductCard {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /agregar.*al carrito/i }));

    expect(defaultProps.onAddToCart).toHaveBeenCalledWith(mockProduct, 1);
    expect(defaultProps.onAddToCart).toHaveBeenCalledTimes(1);
  });

  it("permite agregar más de una unidad desde la card", () => {
    render(<ProductCard {...defaultProps} />);

    fireEvent.click(screen.getByLabelText("Aumentar cantidad de Jamón cocido natural 250 g"));
    fireEvent.click(screen.getByLabelText("Aumentar cantidad de Jamón cocido natural 250 g"));
    fireEvent.click(screen.getByRole("button", { name: /agregar.*al carrito/i }));

    expect(defaultProps.onAddToCart).toHaveBeenCalledWith(mockProduct, 3);
  });

  it("navega al detalle al tocar la card, sin botón de detalle aparte", () => {
    render(<ProductCard {...defaultProps} />);

    const detailLink = screen.getByRole("link", { name: /ver detalle de/i });
    expect(detailLink).toHaveAttribute("href", "/mi-negocio/catalogo/prod-1");
    expect(screen.queryByRole("button", { name: /^detalle$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^detalle$/i })).not.toBeInTheDocument();
  });

  it("muestra el estado sin stock y deshabilita la compra", () => {
    render(
      <ProductCard
        {...defaultProps}
        product={{ ...mockProduct, amount: 0 }}
      />,
    );

    expect(screen.getAllByText("Sin stock").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /agregar.*al carrito/i })).toBeDisabled();
  });

  it("muestra la cantidad en carrito y permite agregar otro", () => {
    render(<ProductCard {...defaultProps} cartQuantity={2} />);

    expect(screen.getByText("2 en carrito")).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: /agregar.*al carrito/i });
    expect(addButton).toBeEnabled();
    expect(addButton).toHaveTextContent("Agregar");
  });

  it("deshabilita la compra cuando ya se alcanzó el stock disponible", () => {
    render(<ProductCard {...defaultProps} cartQuantity={10} />);

    expect(screen.getByRole("button", { name: /agregar.*al carrito/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /agregar.*al carrito/i })).toHaveTextContent("Máximo");
  });

  it("usa un fallback accesible cuando el producto no tiene imagen", () => {
    render(<ProductCard {...defaultProps} />);

    expect(screen.getByRole("img", { name: "Imagen no disponible" })).toBeInTheDocument();
  });

  it("mantiene foco visible y transiciones explícitas", () => {
    const { container } = render(<ProductCard {...defaultProps} />);
    const article = container.querySelector("article");
    const addButton = screen.getByRole("button", { name: /agregar.*al carrito/i });

    expect(article?.className).toContain("focus-within:ring-2");
    expect(article?.className).toContain("motion-safe:transition-[transform,box-shadow]");
    expect(article?.className).not.toContain("transition-all");
    expect(addButton.className).toContain("motion-safe:transition-colors");
    expect(addButton.className).not.toContain("transition-all");
  });
});
