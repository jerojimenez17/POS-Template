// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import BarcodeModal from "@/components/stock/BarcodeModal";
import JsBarcode from "jsbarcode";

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
    DialogTrigger: ({ children }: any) => (
      <div data-testid="dialog-trigger" onClick={() => onOpenChange?.(true)}>
        {children}
      </div>
    ),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, type }: any) => (
    <button type={type ?? "button"} onClick={onClick}>
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
      const foundTag = Array.from(tagCards).find(
        (el) => el.style.height === "3.5cm"
      );
      expect(foundTag).toBeTruthy();
    });

    it("should have tag height of 5cm when codebar is present (AC2)", () => {
      renderAndOpen(
        <BarcodeModal {...defaultProps} codebar="123456789012" />
      );
      const tagCards = document.querySelectorAll<HTMLElement>('[style*="height"]');
      const foundTag = Array.from(tagCards).find(
        (el) => el.style.height === "5cm"
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
  });

  describe("Barcode source selector", () => {
    it("should show source selector buttons when codebar is present", () => {
      renderAndOpen(
        <BarcodeModal {...defaultProps} codebar="123456789012" />
      );
      expect(screen.getByText(/Código interno:/)).toBeInTheDocument();
      expect(screen.getByText(/Código de barras:/)).toBeInTheDocument();
    });

    it("should NOT show source selector when codebar is absent", () => {
      renderAndOpen(<BarcodeModal {...defaultProps} codebar={undefined} />);
      expect(screen.queryByText(/Código interno:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Código de barras:/)).not.toBeInTheDocument();
    });

    it("should switch to codebar source when clicking 'Código de barras' button", () => {
      renderAndOpen(
        <BarcodeModal {...defaultProps} codebar="779123456" />
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
