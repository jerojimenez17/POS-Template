// @vitest-environment happy-dom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductPrintModal, { PRODUCT_PRINT_FORMAT_CONFIG } from "@/components/stock/product-print-modal";
import type { ProductExtended } from "@/components/stock/product-form";
import { printElement } from "@/lib/print";
import JsBarcode from "jsbarcode";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/input", () => ({ Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label>,
}));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) => (
    <input {...props} type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} />
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => (
    <select aria-label="Tamaño de papel" value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
vi.mock("jsbarcode", () => ({ default: vi.fn() }));
vi.mock("@/lib/print", () => ({ printElement: vi.fn().mockResolvedValue(undefined) }));

function product(overrides: Partial<ProductExtended> = {}): ProductExtended {
  return {
    id: "p-1", code: "INT-001", codebar: null, description: "Producto de prueba", salePrice: 99.99,
    unit: "Unidad", image: null, imageName: null, brandId: null, categoryId: null, subCategoryId: null,
    price: 80, gain: 25, amount: 1, supplierId: null, businessId: "b-1", creation_date: new Date(),
    last_update: new Date(), client_bonus: 0, ...overrides,
  } as ProductExtended;
}

function openModal(overrides: Partial<React.ComponentProps<typeof ProductPrintModal>> = {}) {
  render(<ProductPrintModal open onOpenChange={vi.fn()} products={[product()]} {...overrides} />);
}

function printOptions() {
  return vi.mocked(printElement).mock.calls[0]?.[1] as { pageStyle: string; format: string };
}

describe("a4-label-missing-barcode — ProductPrintModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("AC1 — A4 sin Generar no muestra .label-code ni SVG, incluido el código interno", () => {
    openModal({ products: [product({ code: "INTERNAL-ONLY" })] });
    const tag = document.querySelector<HTMLElement>(".label-container.no-barcode");
    expect(tag).toBeInTheDocument();
    expect(tag?.querySelectorAll(".label-code")).toHaveLength(0);
    expect(tag?.querySelectorAll(".label-barcode svg")).toHaveLength(0);
    expect(tag).not.toHaveTextContent("INTERNAL-ONLY");
  });

  it("AC1 — A4 sin ningún código tampoco renderiza un código vacío", () => {
    openModal({ products: [product({ code: "", codebar: null })] });
    const tag = document.querySelector<HTMLElement>(".label-container.no-barcode");
    expect(tag?.querySelector(".label-code")).not.toBeInTheDocument();
  });

  it("AC2 — A4 con barcode conserva un .label-code antes de un único SVG", async () => {
    openModal({ products: [product({ code: "INTERNAL-001", codebar: "7791234567890" })] });
    fireEvent.click(screen.getByRole("button", { name: /generar/i }));
    await waitFor(() => expect(document.querySelectorAll(".label-barcode svg")).toHaveLength(1));
    const tag = document.querySelector<HTMLElement>(".label-container.has-barcode");
    const code = tag?.querySelector(".label-code");
    const barcode = tag?.querySelector(".label-barcode");
    expect(code).toHaveTextContent("INTERNAL-001");
    expect(tag?.querySelectorAll(".label-code")).toHaveLength(1);
    expect((code?.compareDocumentPosition(barcode as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vi.mocked(JsBarcode)).toHaveBeenCalledWith(expect.anything(), "7791234567890", expect.objectContaining({ format: "CODE128" }));
  });

  it.each(["thermal", "label-45x55"] as const)("AC3 — %s conserva el código sin SVG", (format) => {
    openModal({ format, products: [product({ code: "INTERNAL-THERMAL", codebar: null })] });
    const tag = document.querySelector<HTMLElement>(".no-barcode");
    expect(tag?.querySelector(".label-code")).toHaveTextContent("INTERNAL-THERMAL");
    expect(tag?.querySelector(".label-barcode svg")).not.toBeInTheDocument();
  });

  it("AC4 — el CSS A4 sin barcode y con precio usa descripción de 20px y wrapping", async () => {
    openModal();
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    await waitFor(() => expect(vi.mocked(printElement)).toHaveBeenCalled());
    const css = printOptions().pageStyle;
    const rule = css.match(/\.no-barcode\.has-price\s+\.label-description\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/font-size:\s*(20px|[2-9]\dpx)/);
    const descriptionRule = css.match(/\.label-description\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(descriptionRule).toMatch(/width:\s*100%/);
    expect(descriptionRule).toMatch(/(?:word-wrap|overflow-wrap)/);
    expect(css).toMatch(/\.no-barcode:not\(.has-price\)[\s\S]*\.label-description\s*\{[^}]*font-size:\s*(20px|[2-9]\dpx)/);
  });

  it("AC5 — el precio A4 sin barcode alcanza 72px y el preview no usa 48px", async () => {
    openModal();
    const price = document.querySelector<HTMLElement>(".label-container.no-barcode .label-price");
    expect(price).toBeInTheDocument();
    expect(price).not.toHaveClass("text-[48px]");
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    await waitFor(() => expect(vi.mocked(printElement)).toHaveBeenCalled());
    expect(printOptions().pageStyle).toMatch(/\.no-barcode\.has-price\s+\.label-price\s*\{[^}]*font-size:\s*(7[2-9]|[89]\d)px/);
  });

  it("AC6 — el precio A4 separa $ del importe y el símbolo es menor", () => {
    openModal();
    const price = document.querySelector<HTMLElement>(".label-container.no-barcode .label-price");
    expect(price?.querySelector(".price-symbol")).toHaveTextContent("$");
    expect(price?.querySelector(".price-amount")).toHaveTextContent("100");
    expect(price?.querySelector(".price-symbol")).not.toHaveClass("text-[48px]");
  });

  it("AC7 — A4 conserva límites físicos, wrapping y precio visible para descripción larga", () => {
    openModal({ products: [product({ description: "Descripción muy larga ".repeat(10) })] });
    const tag = document.querySelector<HTMLElement>(".label-container.no-barcode");
     expect(tag?.style.width).toBe("6.5cm");
    expect(tag?.style.minHeight).toBe("4.5cm");
    expect(tag?.querySelector(".label-description")).toHaveTextContent("Descripción muy larga");
    expect(tag?.querySelector(".label-price")).toBeInTheDocument();
  });

  it("AC8 — la impresión A4 mantiene página, margen, tres columnas y paginación", async () => {
    openModal();
     expect(document.querySelector('[style*="grid-template-columns"]')).toHaveStyle("grid-template-columns: repeat(3, 6.5cm)");
    fireEvent.change(screen.getByLabelText(/copias por producto/i), { target: { value: "14" } });
    expect(document.querySelectorAll(".label-container")).toHaveLength(14);
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    await waitFor(() => expect(vi.mocked(printElement)).toHaveBeenCalled());
    expect(printOptions()).toEqual(expect.objectContaining({ format: "a4", pageStyle: expect.stringContaining("@page { size: A4; margin: 5mm; }") }));
    expect(document.querySelectorAll('[style="page-break-after: always;"]').length).toBeGreaterThan(0);
  });

  it("AC9 — los estilos de thermal y label-45x55 no incorporan reglas tipográficas A4", () => {
    expect(PRODUCT_PRINT_FORMAT_CONFIG.thermal.pageStyle).not.toContain(".price-symbol");
    expect(PRODUCT_PRINT_FORMAT_CONFIG["label-45x55"].pageStyle).not.toContain(".price-symbol");
    expect(PRODUCT_PRINT_FORMAT_CONFIG.thermal.pageStyle).toContain("@page { size: 55mm 65mm; margin: 0; }");
    expect(PRODUCT_PRINT_FORMAT_CONFIG["label-45x55"].pageStyle).toContain("@page { size: 55mm 45mm landscape; margin: 0; }");
  });
});
