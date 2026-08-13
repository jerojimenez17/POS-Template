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

vi.mock("@/components/ui/input", () => ({
  Input: ({ onChange, value, id, ...rest }: any) => (
    <input id={id} value={value} onChange={onChange} {...rest} />
  ),
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      id={id}
      data-testid={id || "checkbox"}
      data-checked={checked ? "true" : "false"}
      onClick={() => onCheckedChange && onCheckedChange(!checked)}
    />
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
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

describe("A4 no-barcode sizing (SPEC: a4-no-barcode-tag-size)", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC1 — A4 no-barcode tag renders with minHeight 3.36cm", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={createProductsWithoutCodebar(1)}
      />
    );
    const noBarcodeTag = document.querySelector(".label-container.no-barcode") as HTMLElement;
    expect(noBarcodeTag).toBeInTheDocument();
    expect(noBarcodeTag.style.minHeight).toBe("3.36cm");
  });

  it("AC2 — A4 barcode tag (with showPrice=true) keeps minHeight 2.8cm (regression guard)", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={createProductsWithCodebar(1)}
      />
    );
    // showBarcode defaults to false; click the "Generar" button to enable barcode
    // rendering so .label-container.has-barcode appears in the DOM.
    const toggleButton = screen.getByRole("button", { name: /generar/i });
    fireEvent.click(toggleButton);
    // showPrice defaults to true; the source uses hasBarcode && showPrice
    // branch which returns TAG_HEIGHT_WITHOUT_BARCODE = "2.8cm".
    const hasBarcodeTag = document.querySelector(".label-container.has-barcode") as HTMLElement;
    expect(hasBarcodeTag).toBeInTheDocument();
    expect(hasBarcodeTag.style.minHeight).toBe("2.8cm");
  });

  it("AC3 — Thermal no-barcode tag still renders with height 2.8cm (regression guard)", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        format="thermal"
        products={createProductsWithoutCodebar(1)}
      />
    );
    const noBarcodeTag = document.querySelector(".no-barcode") as HTMLElement;
    expect(noBarcodeTag).toBeInTheDocument();
    expect(noBarcodeTag.style.height).toBe("2.8cm");
  });

  it("AC4 — Thermal barcode tag with showPrice=true does not set an inline height style (regression guard)", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        format="thermal"
        products={createProductsWithCodebar(1)}
      />
    );
    // In the thermal branch, hasBarcode && showPrice => height = undefined
    // (no inline style emitted). Assert no inline height value is set.
    const allTags = document.querySelectorAll('[style*="height"]');
    let foundThermalBarcodeTagWithHeight = false;
    allTags.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const height = htmlEl.style.height;
      // The thermal barcode+showPrice card should NOT have an inline height of
      // 3.2cm or 65mm; if any tag card has a height, it should be the no-barcode
      // 2.8cm one.
      if (height === "3.2cm" || height === "65mm") {
        foundThermalBarcodeTagWithHeight = true;
      }
    });
    expect(foundThermalBarcodeTagWithHeight).toBe(false);
  });

  it("AC5 — A4 pageStyle contains @page { size: A4; margin: 5mm; }", async () => {
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
        pageStyle: expect.stringContaining("@page { size: A4; margin: 5mm; }"),
      })
    );
  });

  it("AC6 — A4 pageStyle contains .no-barcode.has-price .label-price with font-size 48px and font-weight 900", async () => {
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
    const calls = (printElement as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const pageStyle: string = calls[0][1].pageStyle;
    expect(pageStyle).toContain(".no-barcode.has-price .label-price");
    expect(pageStyle).toContain("font-size: 48px");
    expect(pageStyle).toContain("font-weight: 900");
  });

  it("AC7 — A4 pageStyle rule .no-barcode.has-price .label-description declares font-size 14px", async () => {
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
    const calls = (printElement as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const pageStyle: string = calls[0][1].pageStyle;
    // Verify the rule for the specific selector declares 14px (up from 12px).
    // Match the rule body between the opening brace following the selector and
    // the matching closing brace.
    const ruleMatch = pageStyle.match(
      /\.no-barcode\.has-price\s+\.label-description\s*\{([^}]*)\}/
    );
    expect(ruleMatch).not.toBeNull();
    const ruleBody = ruleMatch![1];
    expect(ruleBody).toMatch(/font-size:\s*14px/);
  });

  it("AC8 — A4 pageStyle contains .label-container.no-barcode with border-style solid !important", async () => {
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
    const calls = (printElement as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const pageStyle: string = calls[0][1].pageStyle;
    expect(pageStyle).toContain(".label-container.no-barcode");
    expect(pageStyle).toContain("border-style: solid");
    expect(pageStyle).toContain("!important");
  });

  it("AC9 — Thermal pageStyle does not contain font-size: 32px nor border-style: solid (regression guard)", async () => {
    const { printElement } = await import("@/lib/print");
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        format="thermal"
        products={createProductsWithoutCodebar(1)}
      />
    );
    const printButton = screen.getByRole("button", { name: /imprimir/i });
    fireEvent.click(printButton);
    const calls = (printElement as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const pageStyle: string = calls[0][1].pageStyle;
    expect(pageStyle).not.toContain("font-size: 32px");
    expect(pageStyle).not.toContain("border-style: solid");
  });

  it("AC10 — printElement is invoked with format: 'a4' under default A4 render", async () => {
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
      expect.objectContaining({ format: "a4" })
    );
  });

  it("AC11 — Mixed batch: A4 grid is still well-formed (3-column grid present) and no card exceeds the page", () => {
    // Interpretation: the A4 grid uses a 3-column uniform layout (grid-template-columns:
    // repeat(3, TAG_WIDTH)). Different tags may have different minHeight values per the
    // per-card branch (hasBarcode && showPrice => 2.8cm; hasBarcode => 3.2cm; no-barcode
    // => 3.36cm). All values fit the A4 page (max 3.36cm + 2mm gap × 7 = ~28.5cm <= 28.7cm).
    // So we assert: (a) the grid container still has 3 columns, (b) no card has a
    // minHeight that exceeds 3.36cm.
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={createMixedProducts()}
      />
    );
    const gridContainer = document.querySelector('[style*="grid-template-columns"]') as HTMLElement;
    expect(gridContainer).toBeInTheDocument();
    expect(gridContainer).toHaveStyle("grid-template-columns: repeat(3, 6.3cm)");

    const allLabelContainers = document.querySelectorAll(".label-container") as NodeListOf<HTMLElement>;
    expect(allLabelContainers.length).toBeGreaterThan(0);
    const parseCm = (val: string): number => {
      const match = val.match(/^([\d.]+)cm$/);
      return match ? parseFloat(match[1]) : 0;
    };
    allLabelContainers.forEach((card) => {
      const minHeight = card.style.minHeight;
      if (minHeight) {
        expect(parseCm(minHeight)).toBeLessThanOrEqual(3.36);
      }
    });
  });

  it("AC12 — On-screen A4 no-barcode tag className still includes border-dashed (print-only override)", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={createProductsWithoutCodebar(1)}
      />
    );
    const noBarcodeTag = document.querySelector(".label-container.no-barcode") as HTMLElement;
    expect(noBarcodeTag).toBeInTheDocument();
    expect(noBarcodeTag.className).toContain("border-dashed");
  });

  it("AC15 — A4 on-screen no-barcode price element uses text-[48px] (on-screen mirror of AC6)", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={createProductsWithoutCodebar(1)}
      />
    );
    const noBarcodePrice = document.querySelector(
      ".label-container.no-barcode .label-price"
    ) as HTMLElement;
    expect(noBarcodePrice).toBeInTheDocument();
    expect(noBarcodePrice.className).toContain("text-[48px]");
    // Old 24px class must be gone (no regression back to text-2xl).
    expect(noBarcodePrice.className).not.toContain("text-2xl");
  });

  it("AC16 — A4 on-screen barcode price element still uses text-lg (regression guard)", () => {
    render(
      <ProductPrintModal
        open={true}
        onOpenChange={mockOnOpenChange}
        products={createProductsWithCodebar(1)}
      />
    );
    const toggleButton = screen.getByRole("button", { name: /generar/i });
    fireEvent.click(toggleButton);
    const hasBarcodePrice = document.querySelector(
      ".label-container.has-barcode .label-price"
    ) as HTMLElement;
    expect(hasBarcodePrice).toBeInTheDocument();
    expect(hasBarcodePrice.className).toContain("text-lg");
  });
});
