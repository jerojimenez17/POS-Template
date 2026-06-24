// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CodeBarModal from "@/components/stock/code-bar-modal";
import JsBarcode from "jsbarcode";

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
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      dialogOpen ? <h2 data-testid="dialog-title">{children}</h2> : null,
    DialogFooter: ({ children }: { children: React.ReactNode }) =>
      dialogOpen ? <div data-testid="dialog-footer">{children}</div> : null,
    DialogTrigger: ({ children, asChild }: any) => (
      <div data-testid="dialog-trigger" onClick={() => onOpenChange?.(true)}>
        {children}
      </div>
    ),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock("jsbarcode", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/print", () => ({
  printElement: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

function openDialog() {
  fireEvent.click(screen.getByTestId("dialog-trigger"));
}

function renderAndOpen(elm: React.ReactElement) {
  render(elm);
  openDialog();
}

describe("CodeBarModal Component", () => {
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

    it("should render product price with unit suffix on tag card", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      expect(screen.getByText("$99.99/u")).toBeInTheDocument();
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

  describe("Tag dimensions (AC1, AC2)", () => {
    it("should have tag width of 6cm", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="width"]');
      const foundTag = Array.from(tagCards).find(
        (el) => el.style.width === "6.3cm"
      );
      expect(foundTag).toBeTruthy();
    });

    it("should have tag height of 3.5cm when codebar is null (AC1)", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="height"]');
      const foundTag = Array.from(tagCards).find(
        (el) => el.style.height === "3.5cm"
      );
      expect(foundTag).toBeTruthy();
    });

    it("should have tag height of 5cm when codebar is present (AC2)", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar="123456789012"
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="height"]');
      const foundTag = Array.from(tagCards).find(
        (el) => el.style.height === "5cm"
      );
      expect(foundTag).toBeTruthy();
    });

    it("should not have inline height when codebar is absent (no height set)", () => {
      renderAndOpen(
        <CodeBarModal
          code="CODE001"
          codebar={undefined}
          description="Test Product"
          salePrice={99.99}
          unit="Unidad"
        />
      );
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="height"]');
      const tagsWithWrongHeight = Array.from(tagCards).filter(
        (el) => el.style.height && el.style.height !== "3.5cm"
      );
      expect(tagsWithWrongHeight.length).toBe(0);
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
      const allElements = document.querySelectorAll("div, span, svg");
      let codeIndex = -1;
      let barcodeIndex = -1;
      allElements.forEach((el, idx) => {
        if (el.textContent?.trim() === "CODE001") codeIndex = idx;
        if (el.tagName === "SVG") {
          const hasRef = el.hasAttribute("ref") || el.classList.contains("w-full");
          if (hasRef && barcodeIndex === -1) barcodeIndex = idx;
        }
      });
      expect(codeIndex).toBeGreaterThan(-1);
      expect(barcodeIndex).toBeGreaterThan(-1);
      expect(codeIndex).toBeLessThan(barcodeIndex);
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


