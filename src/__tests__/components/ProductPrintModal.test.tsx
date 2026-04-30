/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ProductPrintModal from "@/components/stock/product-print-modal";
import { ProductExtended } from "@/components/stock/product-form";

// Mock Radix UI Dialog components
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, "data-testid": testId }: any) => (
    <button data-testid={testId || "button"} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock JsBarcode
vi.mock("jsbarcode", () => ({
  default: vi.fn(),
}));

const mockProducts: ProductExtended[] = [
  {
    id: "product-1",
    code: "P001",
    description: "Product A with Large Description",
    salePrice: 1500.5,
    unit: "unidades",
    image: null,
    imageName: null,
    brandId: null,
    categoryId: null,
    subCategoryId: null,
    price: 1000,
    gain: 50,
    amount: 10,
    supplierId: null,
    businessId: "biz-1",
    creation_date: new Date(),
    last_update: new Date(),
    client_bonus: 0,
  } as ProductExtended,
  {
    id: "product-2",
    code: "P002",
    description: "Product B",
    salePrice: 2500,
    unit: "kg",
    image: null,
    imageName: null,
    brandId: null,
    categoryId: null,
    subCategoryId: null,
    price: 2000,
    gain: 25,
    amount: 5,
    supplierId: null,
    businessId: "biz-1",
    creation_date: new Date(),
    last_update: new Date(),
    client_bonus: 0,
  } as ProductExtended,
];

describe("ProductPrintModal Component", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.print
    global.print = vi.fn();
    // Mock document.getElementById
    const mockCanvas = {
      toDataURL: vi.fn().mockReturnValue("data:image/png;base64,mocked"),
    };
    vi.spyOn(document, "getElementById").mockReturnValue(mockCanvas as any);
  });

  it("should not render when open is false", () => {
    render(
      <ProductPrintModal
        open={false}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("should render when open is true", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    expect(screen.getByTestId("dialog")).toBeInTheDocument();
  });

  it("should display all selected products", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    expect(screen.getByText("Product A with Large Description")).toBeInTheDocument();
    expect(screen.getByText("Product B")).toBeInTheDocument();
  });

  it("should display description in VERY LARGE font (36-48px)", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    const descriptionElements = document.querySelectorAll(".label-description");
    expect(descriptionElements.length).toBeGreaterThan(0);

    descriptionElements.forEach((el) => {
      const fontSize = window.getComputedStyle(el).fontSize;
      const sizeNum = parseInt(fontSize);
      expect(sizeNum).toBeGreaterThanOrEqual(30);
      expect(sizeNum).toBeLessThanOrEqual(48);
    });
  });

  it("should allow editing the product description for printing", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    const descriptionElements = document.querySelectorAll(".label-description");
    expect(descriptionElements.length).toBeGreaterThan(0);
    
    const firstDesc = descriptionElements[0];
    expect(firstDesc).toHaveAttribute("contentEditable", "true");
    
    // Simulate user editing
    fireEvent.input(firstDesc, { target: { textContent: "Edited Product A" } });
    
    expect(firstDesc.textContent).toBe("Edited Product A");
  });

  it("should display sale price in VERY LARGE font (40-52px)", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    const priceElements = document.querySelectorAll(".label-price");
    expect(priceElements.length).toBeGreaterThan(0);

    priceElements.forEach((el) => {
      const fontSize = window.getComputedStyle(el).fontSize;
      const sizeNum = parseInt(fontSize);
      expect(sizeNum).toBeGreaterThanOrEqual(40);
      expect(sizeNum).toBeLessThanOrEqual(52);
    });
  });

  it("should display sale price with currency format", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    expect(screen.getByText("$1,500.50")).toBeInTheDocument();
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
  });

  it("should render barcode for each product", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    const barcodeElements = document.querySelectorAll(".label-barcode");
    expect(barcodeElements.length).toBe(2);
  });

  it("should display product code below barcode", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    expect(screen.getByText("P001")).toBeInTheDocument();
    expect(screen.getByText("P002")).toBeInTheDocument();
  });

  it("should display product code in medium font (14-16px)", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    const codeElements = document.querySelectorAll(".label-code");
    expect(codeElements.length).toBeGreaterThan(0);

    codeElements.forEach((el) => {
      const fontSize = window.getComputedStyle(el).fontSize;
      const sizeNum = parseInt(fontSize);
      expect(sizeNum).toBeGreaterThanOrEqual(14);
      expect(sizeNum).toBeLessThanOrEqual(16);
    });
  });

  it("should have barcode smaller than description text", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    const descriptionElements = document.querySelectorAll(".label-description");
    const barcodeElements = document.querySelectorAll(".label-barcode");

    expect(descriptionElements.length).toBeGreaterThan(0);
    expect(barcodeElements.length).toBeGreaterThan(0);

    descriptionElements.forEach((descEl) => {
      const descFontSize = parseInt(window.getComputedStyle(descEl).fontSize);
      barcodeElements.forEach((barEl) => {
        const barHeight = parseInt(window.getComputedStyle(barEl).height || "40");
        expect(descFontSize).toBeGreaterThan(barHeight);
      });
    });
  });

  it("should call window.print when Imprimir button is clicked", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    const printButton = screen.getByText(/imprimir/i);
    fireEvent.click(printButton);

    expect(global.print).toHaveBeenCalled();
  });

  it("should close modal when Cerrar button is clicked", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    const closeButton = screen.getByText(/cerrar/i);
    fireEvent.click(closeButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("should use 80mm width thermal print layout", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={mockProducts}
      />
    );

    const printContainer = document.querySelector(".print-container");
    expect(printContainer).toBeInTheDocument();

    const width = window.getComputedStyle(printContainer!).width;
    const widthNum = parseInt(width);
    expect(widthNum).toBeCloseTo(80, 0);
  });

  it("should handle product with null code", () => {
    const productsWithNull: ProductExtended[] = [
      {
        id: "product-3",
        code: null,
        description: "Product with no code",
        salePrice: 100,
        unit: "unidades",
        image: null,
        imageName: null,
        brandId: null,
        categoryId: null,
        subCategoryId: null,
        price: 80,
        gain: 25,
        amount: 0,
        supplierId: null,
        businessId: "biz-1",
        creation_date: new Date(),
        last_update: new Date(),
        client_bonus: 0,
      } as ProductExtended,
    ];

    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={productsWithNull}
      />
    );

    expect(screen.getByText("Product with no code")).toBeInTheDocument();
  });

  it("should render without crashing for empty products array", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={[]}
      />
    );

    expect(screen.getByTestId("dialog")).toBeInTheDocument();
  });
});
