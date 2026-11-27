import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductDetail } from "@/components/catalog/ProductDetail";
import { CartContext } from "@/components/catalog/context/CartContext";
import { PublicProduct } from "@/actions/catalog";

/* eslint-disable @next/next/no-img-element */
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const rest = { ...props };
    delete rest.priority;
    return <img alt="" {...rest} />;
  },
}));
/* eslint-enable @next/next/no-img-element */

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const mockCartContext = {
  cartState: {
    id: "",
    products: [],
    total: 0,
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

function renderWithCart(ui: React.ReactElement) {
  return render(
    <CartContext.Provider value={mockCartContext}>
      {ui}
    </CartContext.Provider>,
  );
}

const baseProduct: PublicProduct = {
  id: "prod-1",
  code: "P001",
  description: "Producto de prueba",
  brand: "Marca Test",
  category: "Categoría Test",
  salePrice: 150.5,
  unit: "un",
  image: null,
  images: [],
  amount: 10,
  details: "Un producto de prueba",
};

describe("ProductDetail — multi-image carousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render carousel arrows and dots when multiple images are provided", () => {
    const product: PublicProduct = {
      ...baseProduct,
      images: [
        "https://example.com/photo1.jpg",
        "https://example.com/photo2.jpg",
        "https://example.com/photo3.jpg",
      ],
    };

    renderWithCart(<ProductDetail product={product} businessSlug="test-shop" />);

    expect(screen.getByLabelText("Imagen anterior")).toBeInTheDocument();
    expect(screen.getByLabelText("Siguiente imagen")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Imagen \d+$/)).toHaveLength(3);
  });

  it("should update current image when clicking next arrow", () => {
    const product: PublicProduct = {
      ...baseProduct,
      images: [
        "https://example.com/photo1.jpg",
        "https://example.com/photo2.jpg",
      ],
    };

    renderWithCart(<ProductDetail product={product} businessSlug="test-shop" />);

    fireEvent.click(screen.getByLabelText("Siguiente imagen"));

    const dots = screen.getAllByLabelText(/^Imagen \d+$/);
    expect(dots[1].className).toContain("bg-primary");
    expect(dots[1].className).not.toContain("bg-background/80");
  });

  it("should show single legacy image without carousel arrows", () => {
    const product: PublicProduct = {
      ...baseProduct,
      images: [],
      image: "https://example.com/legacy.jpg",
    };

    renderWithCart(<ProductDetail product={product} businessSlug="test-shop" />);

    expect(screen.queryByLabelText("Imagen anterior")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Siguiente imagen")).not.toBeInTheDocument();
    expect(screen.queryAllByLabelText(/^Imagen \d+$/)).toHaveLength(0);
  });

  it("should show the accessible placeholder when no images are available", () => {
    const product: PublicProduct = {
      ...baseProduct,
      image: null,
      images: [],
    };

    renderWithCart(<ProductDetail product={product} businessSlug="test-shop" />);

    expect(screen.getByRole("img", { name: "Imagen no disponible" })).toBeInTheDocument();
  });

  it("should fall back to legacy image when images array is empty but image field is set", () => {
    const product: PublicProduct = {
      ...baseProduct,
      images: [],
      image: "https://example.com/fallback.jpg",
    };

    renderWithCart(<ProductDetail product={product} businessSlug="test-shop" />);

    const mainImage = screen.getByAltText(/Imagen de Producto de prueba/);
    expect(mainImage).toHaveAttribute("src", "https://example.com/fallback.jpg");
  });

  it("inicia con cantidad 1 y permite agregar al carrito", () => {
    renderWithCart(<ProductDetail product={baseProduct} businessSlug="test-shop" />);

    const input = screen.getByLabelText("Cantidad del producto") as HTMLInputElement;
    expect(input.value).toBe("1");

    const addButton = screen.getByRole("button", { name: /agregar al carrito/i });
    expect(addButton).toBeEnabled();
    fireEvent.click(addButton);

    expect(mockCartContext.addItem).toHaveBeenCalledTimes(1);
  });

  it("deshabilita la compra cuando la cantidad vuelve a 0", () => {
    renderWithCart(<ProductDetail product={baseProduct} businessSlug="test-shop" />);

    fireEvent.click(screen.getByLabelText("Disminuir cantidad"));

    const input = screen.getByLabelText("Cantidad del producto") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.getByRole("button", { name: /elegí una cantidad/i })).toBeDisabled();
  });

  it("deshabilita la compra cuando no hay stock", () => {
    renderWithCart(
      <ProductDetail
        product={{ ...baseProduct, amount: 0 }}
        businessSlug="test-shop"
      />,
    );

    expect(screen.getByRole("button", { name: /sin stock/i })).toBeDisabled();
  });

  it("aumenta y disminuye la cantidad con los controles +/-", () => {
    renderWithCart(<ProductDetail product={baseProduct} businessSlug="test-shop" />);

    const increaseButton = screen.getByLabelText("Aumentar cantidad");
    const decreaseButton = screen.getByLabelText("Disminuir cantidad");
    const input = screen.getByLabelText("Cantidad del producto") as HTMLInputElement;

    expect(input.value).toBe("1");

    fireEvent.click(increaseButton);
    expect(input.value).toBe("2");

    fireEvent.click(decreaseButton);
    expect(input.value).toBe("1");

    fireEvent.click(decreaseButton);
    expect(input.value).toBe("");
  });
});
