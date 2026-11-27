// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import BarcodeModal from "@/components/stock/BarcodeModal";
import CodeBarModal from "@/components/stock/code-bar-modal";
import JsBarcode from "jsbarcode";

// Merged suite (union): "BarcodeModal Component" covers our redesigned stock-UI modal;
// "CodeBarModal Component" covers upstream's 55×45 landscape label flow (PRs #112/#113).

vi.mock("@/actions/stock", () => ({
  updateProduct: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/components/ui/dialog", () => {
  let dialogOpen = false;
  let onOpenChange: ((open: boolean) => void) | null = null;
  return {
    Dialog: ({ open: _open, onOpenChange: _onOpenChange, children }: any) => {
      onOpenChange = _onOpenChange ? (v: boolean) => _onOpenChange(v) : null;
      dialogOpen = _open ?? false;
      return <div data-testid="dialog">{children}</div>;
    },
    DialogContent: ({ children }: { children: React.ReactNode }) =>
      dialogOpen ? <div data-testid="dialog-content">{children}</div> : null,
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      dialogOpen ? <div data-testid="dialog-header">{children}</div> : null,
    // Merged BarcodeModal renders an accessible DialogTitle; without this export
    // the whole suite crashes at import time.
    DialogTitle: ({ children }: { children?: React.ReactNode }) =>
      dialogOpen ? <h2 data-testid="dialog-title">{children}</h2> : null,
    DialogFooter: ({ children }: { children: React.ReactNode }) =>
      dialogOpen ? <div data-testid="dialog-footer">{children}</div> : null,
    DialogTrigger: ({ children }: any) => (
      <div data-testid="dialog-trigger" onClick={() => onOpenChange?.(true)}>
        {children}
      </div>
    ),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, type, "aria-label": ariaLabel }: any) => (
    <button type={type ?? "button"} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("jsbarcode", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/print", () => ({
  printElement: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function openDialog() {
  fireEvent.click(screen.getByTestId("dialog-trigger"));
}

function renderAndOpen(elm: React.ReactElement) {
  render(elm);
  openDialog();
}

const defaultProps = {
  productId: "prod-1",
  code: "CODE001",
  description: "Test Product",
  salePrice: 99.99,
  unit: "Unidad",
};

describe("BarcodeModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Render product information", () => {
    it("should expose an accessible name for the icon-only trigger", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          description="Test Product"
          salePrice={99.99}
        />
      );
      expect(screen.getByRole("button", { name: "Imprimir código de barras" })).toBeInTheDocument();
    });

    it("should render the dialog title", () => {
      renderAndOpen(<BarcodeModal {...defaultProps} codebar={undefined} />);
      expect(screen.getByText("Código de Barras")).toBeInTheDocument();
    });

    it("should render product description on tag card", () => {
      renderAndOpen(<BarcodeModal {...defaultProps} codebar={undefined} />);
      expect(
        document.querySelector(".label-description")?.textContent
      ).toBe("Test Product");
    });

    it("should render product price with unit suffix on tag card", () => {
      renderAndOpen(<BarcodeModal {...defaultProps} codebar={undefined} />);
      expect(screen.getByText("$99.99/u")).toBeInTheDocument();
    });

    it("should render product code on tag card", () => {
      renderAndOpen(<BarcodeModal {...defaultProps} codebar={undefined} />);
      expect(screen.getByText("CODE001")).toBeInTheDocument();
    });
  });

  describe("Tag dimensions (AC1, AC2)", () => {
    it("should have tag width of 6cm", () => {
      renderAndOpen(<BarcodeModal {...defaultProps} codebar={undefined} />);
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="width"]');
      const foundTag = Array.from(tagCards).find(
        (el) => el.style.width === "6.3cm"
      );
      expect(foundTag).toBeTruthy();
    });

    it("should have tag height of 3.5cm when codebar is null (AC1)", () => {
      renderAndOpen(<BarcodeModal {...defaultProps} codebar={undefined} />);
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="height"]');
      // Tag cards size via min-height (style={{ width, minHeight }}).
      const foundTag = Array.from(tagCards).find(
        (el) => el.style.minHeight === "3.5cm"
      );
      expect(foundTag).toBeTruthy();
    });

    it("should have tag height of 5cm when codebar is present (AC2)", () => {
      renderAndOpen(
        <BarcodeModal {...defaultProps} codebar="123456789012" />
      );
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="height"]');
      const foundTag = Array.from(tagCards).find(
        (el) => el.style.minHeight === "5cm"
      );
      expect(foundTag).toBeTruthy();
    });

    it("should not have inline height when codebar is absent (no height set)", () => {
      renderAndOpen(<BarcodeModal {...defaultProps} codebar={undefined} />);
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="height"]');
      const tagsWithWrongHeight = Array.from(tagCards).filter(
        (el) => el.style.height && el.style.height !== "3.5cm"
      );
      expect(tagsWithWrongHeight.length).toBe(0);
    });
  });

  describe("Barcode rendering", () => {
    it("should render barcode SVG even without codebar (from internal code)", () => {
      renderAndOpen(<BarcodeModal {...defaultProps} codebar={undefined} />);
      const barcodeSvg = document.querySelectorAll("svg.label-barcode, svg.w-full");
      expect(barcodeSvg.length).toBeGreaterThan(0);
    });

    it("should render barcode SVG when codebar is present", () => {
      renderAndOpen(
        <BarcodeModal {...defaultProps} codebar="123456789012" />
      );
      const barcodeSvg = document.querySelectorAll("svg.label-barcode, svg.w-full");
      expect(barcodeSvg.length).toBeGreaterThan(0);
    });

    it("should display product code before barcode in DOM order", () => {
      renderAndOpen(
        <BarcodeModal {...defaultProps} codebar="123456789012" />
      );
      const tagCard = document.querySelector(".label-container");
      expect(tagCard).toBeTruthy();
      const codeEl = tagCard?.querySelector(".label-code");
      const barcodeEl = tagCard?.querySelector("svg");
      expect(codeEl).toBeTruthy();
      expect(barcodeEl).toBeTruthy();
      const position = codeEl!.compareDocumentPosition(barcodeEl!);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("should hide and show the barcode via the toggle button", () => {
      renderAndOpen(<BarcodeModal {...defaultProps} codebar="123456789012" />);
      expect(document.querySelector("svg.label-barcode")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /ocultar código de barras/i }));
      expect(document.querySelector("svg.label-barcode")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /mostrar código de barras/i }));
      expect(document.querySelector("svg.label-barcode")).toBeTruthy();
    });
  });

  describe("Barcode source selector", () => {
    it("should show source selector buttons when codebar is present", () => {
      renderAndOpen(
        <BarcodeModal {...defaultProps} codebar="123456789012" />
      );
      // Current selector: "Generar desde:" grid with two source buttons.
      expect(screen.getByText("Generar desde:")).toBeInTheDocument();
      expect(screen.getByText("Código Interno")).toBeInTheDocument();
      expect(screen.getByText("Código Barras")).toBeInTheDocument();
    });

    it("should NOT show source selector when codebar is absent", () => {
      renderAndOpen(<BarcodeModal {...defaultProps} codebar={undefined} />);
      expect(screen.queryByText("Generar desde:")).not.toBeInTheDocument();
    });

    it("should switch to codebar source when clicking 'Código Barras' button", () => {
      renderAndOpen(
        <BarcodeModal {...defaultProps} codebar="779123456" />
      );
      const barcodeButton = screen.getByText("Código Barras").closest("button");
      expect(barcodeButton).toBeTruthy();
      fireEvent.click(barcodeButton!);
      // Selected source renders as the raised white card in the toggle grid.
      expect(barcodeButton!.className).toContain("bg-white");
      // And the barcode regenerates from the selected source.
      expect(vi.mocked(JsBarcode)).toHaveBeenCalled();
    });
  });

  describe("Print configuration (AC3)", () => {
    it("should call printElement with format thermal", async () => {
      const { printElement } = await import("@/lib/print");
      renderAndOpen(
        <BarcodeModal {...defaultProps} codebar="123456789012" />
      );
      const printButton = screen.getByText(/imprimir/i);
      fireEvent.click(printButton);
      expect(printElement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ format: "thermal" })
      );
    });
  });

  describe("Copies multiplier", () => {
    it("should multiply tag cards based on copies controls", () => {
      renderAndOpen(
        <BarcodeModal {...defaultProps} codebar="123456789012" />
      );
      const tagCards = document.querySelectorAll(".label-container");
      expect(tagCards.length).toBe(1);
      const plusButton = screen.getByText("+");
      for (let i = 0; i < 4; i++) {
        fireEvent.click(plusButton);
      }
      expect(document.querySelectorAll(".label-container").length).toBe(5);
    });
  });
});

describe("CodeBarModal Component — upstream 55×45 landscape label (PRs #112/#113)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Render product information", () => {
    it("should render the dialog title", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      expect(screen.getByText("Codigo de Barras")).toBeInTheDocument();
    });

    it("should render product description on tag card", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      expect(screen.getByText("Test Product")).toBeInTheDocument();
    });

    it("should render product price rounded to tens on tag card", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      expect(screen.getByText("$100")).toBeInTheDocument();
    });

    it("should render product code on tag card", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      expect(screen.getByText("CODE001")).toBeInTheDocument();
    });
  });

  describe("Tag dimensions 55mm × 45mm (AC1, AC2)", () => {
    it("should have tag width of 55mm with or without codebar (AC1)", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const tagCards = document.querySelectorAll<HTMLElement>(".label-container");
      expect(tagCards).toHaveLength(1);
      expect((tagCards[0] as HTMLElement).style.width).toBe("55mm");

      cleanup();
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar="123456789012"
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const barcodeTag = document.querySelector<HTMLElement>(".label-container");
      expect(barcodeTag?.style.width).toBe("55mm");
    });

    it("should have tag height of 45mm when codebar is absent (AC1)", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const tag = document.querySelector<HTMLElement>(".label-container");
      expect(tag?.style.height).toBe("45mm");
    });

    it("should have tag height of 45mm when codebar is present (AC1)", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar="123456789012"
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const tag = document.querySelector<HTMLElement>(".label-container");
      expect(tag?.style.height).toBe("45mm");
    });

    it("should not use a legacy height when codebar is absent", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const tag = document.querySelector<HTMLElement>(".label-container");
      expect(tag?.style.height).toBe("45mm");
      expect(tag?.style.height).not.toBe("3.5cm");
    });
  });

  describe("Barcode rendering", () => {
    it("should render barcode SVG even without codebar (from internal code)", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const barcodeSvg = document.querySelectorAll<HTMLElement>(
        '[style*="width"][style*="height"] svg, svg[class*="w-full"]'
      );
      expect(barcodeSvg.length).toBeGreaterThan(0);
    });

    it("should render barcode SVG when codebar is present", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar="123456789012"
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const barcodeSvg = document.querySelectorAll<HTMLElement>(
        '[style*="width"][style*="height"] svg, svg[class*="w-full"]'
      );
      expect(barcodeSvg.length).toBeGreaterThan(0);
    });

    it("should display product code before barcode in DOM order", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar="123456789012"
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const label = document.querySelector<HTMLElement>(".label-container");
      const code = label?.querySelector<HTMLElement>(".label-code");
      const barcode = label?.querySelector("svg");
      expect(code).toBeInTheDocument();
      expect(barcode).toBeInTheDocument();
      expect(code!.compareDocumentPosition(barcode as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe("Barcode source selector", () => {
    it("should show source selector buttons when codebar is present", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar="123456789012"
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      expect(screen.getByText(/Código interno:/)).toBeInTheDocument();
      expect(screen.getByText(/Código de barras:/)).toBeInTheDocument();
    });

    it("should NOT show source selector when codebar is absent", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      expect(screen.queryByText(/Código interno:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Código de barras:/)).not.toBeInTheDocument();
    });

    it("should switch to codebar source when clicking 'Código de barras' button", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar="779123456"
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const barcodeButton = screen.getByText(/Código de barras: 779123456/);
      fireEvent.click(barcodeButton);
      expect(vi.mocked(JsBarcode)).toHaveBeenCalled();
    });
  });

  describe("Print configuration (AC3)", () => {
    it("should call printElement with format thermal", async () => {
      const { printElement } = await import("@/lib/print");
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar="123456789012"
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const printButton = screen.getByText(/imprimir/i);
      fireEvent.click(printButton);
      expect(printElement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ format: "thermal" })
      );
    });
  });

  describe("Copies multiplier", () => {
    it("should multiply tag cards based on copies input", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar="123456789012"
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const descriptionElements = screen.getAllByText("Test Product");
      expect(descriptionElements.length).toBe(1);
      const copiesInput = screen.getByLabelText(/cantidad de copias/i);
      fireEvent.change(copiesInput, { target: { value: "5" } });
      const updatedElements = screen.getAllByText("Test Product");
      expect(updatedElements.length).toBe(5);
    });
  });
});
