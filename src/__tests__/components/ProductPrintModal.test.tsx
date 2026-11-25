// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ProductPrintModal from "@/components/stock/product-print-modal";
import { ProductExtended } from "@/components/stock/product-form";

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

vi.mock("jsbarcode", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/print", () => ({
  printElement: vi.fn().mockResolvedValue(undefined),
}));

function createMockProduct(overrides: Partial<ProductExtended> = {}): ProductExtended {
  return {
    id: "test-id",
    code: "TST001",
    codebar: null,
    description: "Test Product",
    salePrice: 100,
    unit: "Unidad",
    image: null,
    imageName: null,
    brandId: null,
    categoryId: null,
    subCategoryId: null,
    price: 80,
    gain: 25,
    amount: 10,
    supplierId: null,
    businessId: "biz-1",
    creation_date: new Date(),
    last_update: new Date(),
    client_bonus: 0,
    ...overrides,
  } as ProductExtended;
}

function createProductsWithoutCodebar(count: number): ProductExtended[] {
  return Array.from({ length: count }, (_, i) =>
    createMockProduct({
      id: `prod-no-bc-${i}`,
      code: `NBC${String(i + 1).padStart(3, "0")}`,
      description: `No Barcode Product ${i + 1}`,
      salePrice: 100 + i * 10,
      codebar: null,
    })
  );
}

function createProductsWithCodebar(count: number): ProductExtended[] {
  return Array.from({ length: count }, (_, i) =>
    createMockProduct({
      id: `prod-bc-${i}`,
      code: `BC${String(i + 1).padStart(3, "0")}`,
      description: `Barcode Product ${i + 1}`,
      salePrice: 200 + i * 10,
      codebar: `12345678${String(i).padStart(4, "0")}`,
      unit: "Kg",
    })
  );
}

function createMixedProducts(): ProductExtended[] {
  return [
    createMockProduct({
      id: "mixed-with-bc",
      code: "MIX01",
      description: "Mixed With Barcode",
      salePrice: 300,
      codebar: "9876543210",
      unit: "Kg",
    }),
    createMockProduct({
      id: "mixed-no-bc",
      code: "MIX02",
      description: "Mixed No Barcode",
      salePrice: 150,
      codebar: null,
      unit: "Unidad",
    }),
  ];
}

describe("ProductPrintModal Component", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Render behavior", () => {
    it("should not render when open is false", () => {
      render(
        <ProductPrintModal
          open={false}
          onOpenChange={mockOnOpenChange}
          products={createProductsWithoutCodebar(2)}
        />
      );
      expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
    });

    it("should render when open is true", () => {
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={createProductsWithoutCodebar(2)}
        />
      );
      expect(screen.getByTestId("dialog")).toBeInTheDocument();
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

  describe("Product information display", () => {
    it("should display all products' descriptions and prices", () => {
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={createProductsWithoutCodebar(2)}
        />
      );
      expect(screen.getByText("No Barcode Product 1")).toBeInTheDocument();
      expect(screen.getByText("No Barcode Product 2")).toBeInTheDocument();
    });

    it("should allow editing the product description for printing (AC11)", () => {
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={createProductsWithoutCodebar(1)}
        />
      );
      const descriptionElements = document.querySelectorAll(".label-description");
      expect(descriptionElements.length).toBeGreaterThan(0);
      const firstDesc = descriptionElements[0];
      expect(firstDesc).toHaveAttribute("contentEditable", "true");
      fireEvent.input(firstDesc, { target: { textContent: "Edited Product" } });
      expect(firstDesc.textContent).toBe("Edited Product");
    });

    it("should handle product with null code", () => {
      const productWithNullCode = createMockProduct({
        id: "product-null-code",
        code: null as unknown as string,
        description: "Product with no code",
        salePrice: 100,
      });
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={[productWithNullCode]}
        />
      );
      expect(screen.getByText("Product with no code")).toBeInTheDocument();
    });

    it("should omit the internal product code from A4 no-barcode tags", () => {
      const products = createProductsWithoutCodebar(2);
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={products}
        />
      );
      expect(screen.queryByText("NBC001")).not.toBeInTheDocument();
      expect(screen.queryByText("NBC002")).not.toBeInTheDocument();
    });
  });

  describe("A4 Grid Layout (AC4)", () => {
    it("should render tags in CSS grid with 3 columns", () => {
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={createProductsWithCodebar(3)}
        />
      );
      const gridContainer = document.querySelector('[style*="grid-template-columns"]');
      expect(gridContainer).toBeInTheDocument();
      expect(gridContainer).toHaveStyle("grid-template-columns: repeat(3, 6.5cm)");
    });

    it("should have A4 tag width of 6.5cm", () => {
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={createProductsWithoutCodebar(1)}
        />
      );
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="width"]');
      const foundTag = Array.from(tagCards).find(
        (el) => el.style.width === "6.5cm"
      );
      expect(foundTag).toBeTruthy();
    });

    it("should have tag minHeight of 2.8cm when barcode is generated for a product with codebar (AC6)", () => {
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={createProductsWithCodebar(1)}
        />
      );
      // Barcodes only render after toggling "Generar" (showBarcode defaults to false).
      // With showPrice enabled (the default), generated-barcode tags use the
      // TAG_HEIGHT_WITHOUT_BARCODE (2.8cm) minHeight floor.
      fireEvent.click(screen.getByRole("button", { name: /generar/i }));
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="height"]');
      const foundTag = Array.from(tagCards).find(
        (el) => el.style.minHeight === "2.8cm"
      );
      expect(foundTag).toBeTruthy();
    });

    it("should have tag minHeight of 4.5cm when no product has codebar (AC5)", () => {
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={createProductsWithoutCodebar(1)}
        />
      );
      // A4 no-barcode tags use TAG_HEIGHT_WITHOUT_BARCODE_A4 = 4.5cm as their
      // minHeight floor in the merged source.
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="height"]');
      const foundTag = Array.from(tagCards).find(
        (el) => el.style.minHeight === "4.5cm"
      );
      expect(foundTag).toBeTruthy();
    });

    it("should use per-card minHeight for mixed batch once barcodes are generated (AC7)", () => {
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={createMixedProducts()}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /generar/i }));
      const tagCards = document.querySelectorAll<HTMLElement>(".label-container");
      expect(tagCards.length).toBe(2);
      // hasBarcode = showBarcode && Boolean(codebar || code): both mixed products
      // qualify after "Generar" (the no-codebar one falls back to its internal code),
      // so with showPrice enabled (default) both cards take the 2.8cm floor.
      expect(tagCards[0].style.minHeight).toBe("2.8cm");
      expect(tagCards[1].style.minHeight).toBe("2.8cm");
    });
  });

  describe("Pagination (AC8, AC10)", () => {
    it("should have page breaks between A4 page groups (AC8)", () => {
      const products = createProductsWithCodebar(2);
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={products}
        />
      );
      const copiesInput = screen.getByLabelText(/copias/i);
      fireEvent.change(copiesInput, { target: { value: "10" } });
      const allDivs = document.querySelectorAll("div");
      const pageBreakDivs = Array.from(allDivs).filter(
        (div) => div.style.pageBreakAfter === "always"
      );
      expect(pageBreakDivs.length).toBeGreaterThan(0);
    });

    it("should paginate copies across multiple A4 pages (AC10)", () => {
      const products = createProductsWithCodebar(2);
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={products}
        />
      );
      const copiesInput = screen.getByLabelText(/copias por producto/i);
      fireEvent.change(copiesInput, { target: { value: "10" } });
      const tagContainers = document.querySelectorAll(".label-container, [class*='border-dashed']");
      expect(tagContainers.length).toBe(20);
      const containerParents = new Set<Element | null>();
      tagContainers.forEach((tc) => containerParents.add(tc.parentElement));
      expect(containerParents.size).toBeGreaterThan(1);
    });
  });

  describe("Barcode positioning (AC9)", () => {
    it("should render barcode only for products with codebar or internal code", () => {
      // hasBarcode = showBarcode && Boolean(codebar || code): products fall back to
      // their internal code when codebar is absent (long-standing contract, present
      // in base and merged source). Only a product with neither gets no barcode.
      const mixed = [
        ...createMixedProducts(),
        createMockProduct({
          id: "mixed-neither",
          code: null as unknown as string,
          codebar: null,
          description: "Mixed Neither",
        }),
      ];
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={mixed}
        />
      );
      // Barcodes only render after toggling "Generar" (showBarcode defaults to false).
      fireEvent.click(screen.getByRole("button", { name: /generar/i }));
      const barcodeElements = document.querySelectorAll(".label-barcode");
      const codesWithBarcode = mixed.filter((p) => p.codebar || p.code);
      expect(barcodeElements.length).toBe(codesWithBarcode.length);
      expect(barcodeElements.length).toBe(2);
    });

    it("should display product code before barcode in DOM order (AC9)", () => {
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={createProductsWithCodebar(1)}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /generar/i }));
      const codeElements = document.querySelectorAll(".label-code");
      const barcodeElements = document.querySelectorAll(".label-barcode");
      expect(codeElements.length).toBeGreaterThan(0);
      expect(barcodeElements.length).toBeGreaterThan(0);
      codeElements.forEach((codeEl, idx) => {
        const barEl = barcodeElements[idx];
        if (barEl) {
          const position = codeEl.compareDocumentPosition(barEl);
          expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
      });
    });
  });

  describe("Print behavior (AC4)", () => {
    it("should call printElement with format a4 and A4 page style", async () => {
      const { printElement } = await import("@/lib/print");
      render(
        <ProductPrintModal
          open={true}
          onOpenChange={mockOnOpenChange}
          products={createProductsWithoutCodebar(1)}
        />
      );
      const printButton = screen.getByRole("button", { name: /imprimir/i });
      fireEvent.click(printButton);
      expect(printElement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          format: "a4",
          pageStyle: expect.stringContaining("A4"),
        })
      );
    });
  });
});
