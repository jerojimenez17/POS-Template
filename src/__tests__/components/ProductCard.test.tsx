/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProductCard from "@/components/catalog/ProductCard";
import { PublicProduct } from "@/actions/catalog";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { ...imgProps } = props;
    return <img {...imgProps} />;
  },
}));

vi.mock("../../../public/no-image.svg", () => ({
  default: "/no-image.svg",
}));

const mockProduct: PublicProduct = {
  id: "prod-1",
  code: "P001",
  description: "Producto de prueba",
  brand: "Marca Test",
  category: "Categoría Test",
  salePrice: 150.5,
  unit: "un",
  image: "https://example.com/img.jpg",
  amount: 10,
  details: "Detalles del producto",
};

const MockProductModal = ({
  product: _product,
  children,
}: {
  product: PublicProduct;
  children: React.ReactNode;
}) => <div data-testid="product-modal">{children}</div>;

const defaultProps = {
  product: mockProduct,
  isCatalog: true,
  unitsToOrder: { id: "", amount: 0 },
  onQuantityChange: vi.fn(),
  onAddToCart: vi.fn(),
  ProductModal: MockProductModal,
};

describe("ProductCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Image aspect ratio - 4:3", () => {
    it("should use aspect-[4/3] class instead of aspect-square", () => {
      const { container } = render(<ProductCard {...defaultProps} />);
      const imageContainer = container.querySelector("div.relative");
      expect(imageContainer?.className).toContain("aspect-[4/3]");
    });
  });

  describe("Image uses fill prop", () => {
    it("should render product Image with fill prop to avoid CLS", () => {
      render(<ProductCard {...defaultProps} />);
      const img = screen.getByAltText(/Imagen de Producto de prueba/);
      expect(img).toHaveAttribute("alt");
      expect(img.closest(".relative")).toBeTruthy();
    });
  });

  describe("motion-safe animation classes", () => {
    it("should use motion-safe:transition-shadow on the Card", () => {
      const { container } = render(<ProductCard {...defaultProps} />);
      const card = container.querySelector(
        "[class*='motion-safe:transition-shadow']",
      );
      expect(card).toBeTruthy();
    });

    it("should use motion-safe:transition-colors on the add-to-cart button", () => {
      render(<ProductCard {...defaultProps} />);
      const addButton = screen.getByRole("button", {
        name: /agregar.*al carrito/i,
      });
      expect(addButton.className).toContain("motion-safe:transition-colors");
    });

    it("should use motion-safe:transition-transform on the product image", () => {
      render(<ProductCard {...defaultProps} />);
      const img = screen.getByAltText(/Imagen de Producto de prueba/);
      expect(img.className).toContain("motion-safe:transition-transform");
      expect(img.className).toContain("motion-safe:duration-500");
    });
  });

  describe("Accessibility - aria-label", () => {
    it("should have aria-label on the Card wrapper", () => {
      const { container } = render(<ProductCard {...defaultProps} />);
      const card = container.querySelector("[class*='rounded-2xl']");
      expect(card).toHaveAttribute("aria-label");
    });
  });

  describe("Quantity input attributes", () => {
    it("should have autoComplete off on the quantity input", () => {
      render(<ProductCard {...defaultProps} />);
      const input = screen.getByRole("spinbutton");
      expect(input).toHaveAttribute("autoComplete", "off");
    });
  });

  describe("Transition class specificity", () => {
    it("should use transition-shadow instead of transition-all on the Card", () => {
      const { container } = render(<ProductCard {...defaultProps} />);
      const card = container.querySelector("[class*='rounded-2xl']");
      expect(card?.className).toContain("transition-shadow");
      expect(card?.className).not.toContain("transition-all");
    });

    it("should use transition-colors instead of transition-all on the add-to-cart button", () => {
      render(<ProductCard {...defaultProps} />);
      const addButton = screen.getByRole("button", {
        name: /agregar.*al carrito/i,
      });
      expect(addButton.className).toContain("transition-colors");
      expect(addButton.className).not.toContain("transition-all");
    });
  });
});
