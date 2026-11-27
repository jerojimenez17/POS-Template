// @vitest-environment happy-dom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductPrintModal, { PRODUCT_PRINT_FORMAT_CONFIG } from "@/components/stock/product-print-modal";
import { ProductExtended } from "@/components/stock/product-form";
import { printElement } from "@/lib/print";
import JsBarcode from "jsbarcode";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));
vi.mock("@/components/ui/input", () => ({ Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));
vi.mock("@/components/ui/label", () => ({ Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label> }));
vi.mock("@/components/ui/checkbox", () => ({ Checkbox: ({ checked, onCheckedChange, ...props }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) => <input {...props} type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} /> }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => <select aria-label="Tamaño de papel" value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>, SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>, SelectTrigger: () => null, SelectValue: () => null,
}));
vi.mock("jsbarcode", () => ({ default: vi.fn() }));
vi.mock("@/lib/print", () => ({ printElement: vi.fn().mockResolvedValue(true) }));

function product(overrides: Partial<ProductExtended> = {}): ProductExtended {
  return { id: "p-1", code: "INT-001", codebar: "7791234567890", description: "Producto de prueba", salePrice: 99.99, unit: "Unidad", image: null, imageName: null, brandId: null, categoryId: null, subCategoryId: null, price: 80, gain: 25, amount: 1, supplierId: null, businessId: "b-1", creation_date: new Date(), last_update: new Date(), client_bonus: 0, ...overrides } as ProductExtended;
}
function openModal(props: Partial<React.ComponentProps<typeof ProductPrintModal>> = {}) { render(<ProductPrintModal open onOpenChange={vi.fn()} products={[product()]} {...props} />); }
function chooseLabel() { fireEvent.change(screen.getByRole("combobox", { name: "Tamaño de papel" }), { target: { value: "label-45x55" } }); }

describe("ProductPrintModal — label-45x55 redefinida 55 × 45 landscape", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expone solo los tres valores y el label visible horizontal", () => {
    openModal();
    expect(Array.from(screen.getByRole("combobox").querySelectorAll("option")).map((option) => option.value)).toEqual(["a4", "thermal", "label-45x55"]);
    const labelOption = Array.from(screen.getByRole("combobox").querySelectorAll<HTMLOptionElement>("option")).find((option) => option.textContent?.includes("Etiqueta (55 × 45 mm)"));
    expect(labelOption?.value).toBe("label-45x55");
  });

  it("mantiene una configuración física única entre preview y print", () => {
    openModal(); chooseLabel();
    const label = document.querySelector<HTMLElement>(".label-container");
    expect(label?.style.width).toBe("55mm"); expect(label?.style.height).toBe("45mm"); expect(label?.style.boxSizing).toBe("border-box");
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    const options = vi.mocked(printElement).mock.calls[0]?.[1];
    expect(options).toEqual(expect.objectContaining({ format: "thermal", orientation: "landscape" }));
    expect(options?.pageStyle).toMatch(/@page\s*\{\s*size:\s*55mm 45mm landscape;\s*margin:\s*0/);
    expect(options?.pageStyle).toContain("html, body { width: 55mm; height: 45mm; margin: 0; padding: 0; }");
    expect(screen.getByText(/escala 100%.*márgenes ninguno.*orientación horizontal|landscape/i)).toBeInTheDocument();
  });

  it("no conserva geometría portrait ni dimensiones invertidas", () => {
    const config = PRODUCT_PRINT_FORMAT_CONFIG["label-45x55"];
    expect(config.width).toBe("55mm"); expect(config.height).toBe("45mm"); expect(config.pageSize).toBe("55mm 45mm"); expect(config.orientation).toBe("landscape");
    expect(`${config.pageStyle} ${config.width} ${config.height}`).not.toMatch(/45mm\s+55mm|portrait/);
  });

  it.each([1, 3, 50])("renders exactly %i copies with breaks only between labels", (copies) => {
    openModal(); chooseLabel();
    fireEvent.change(screen.getByLabelText(/copias por producto/i), { target: { value: String(copies) } });
    const labels = Array.from(document.querySelectorAll<HTMLElement>(".label-container"));
    expect(labels).toHaveLength(copies);
    expect(labels.slice(0, -1).every((label) => label.style.pageBreakAfter === "always")).toBe(true);
    expect(labels.at(-1)?.style.pageBreakAfter).toBe("");
  });

  it("conserva contenido, precio opcional, fallback CODE128 y overflow seguro", () => {
    openModal({ products: [product({ description: "Descripción larga ".repeat(8), codebar: null, code: "7791234567890" })] }); chooseLabel();
    const label = document.querySelector<HTMLElement>(".label-container");
    expect(label).toHaveTextContent(/Descripción larga/); expect(label).toHaveTextContent("7791234567890"); expect(label).toHaveTextContent("$100");
    fireEvent.click(screen.getByLabelText(/mostrar precio/i)); expect(label).not.toHaveTextContent("$100");
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    expect(vi.mocked(printElement).mock.calls[0]?.[1]?.pageStyle).toMatch(/overflow:\s*hidden/);
    expect(vi.mocked(printElement).mock.calls[0]?.[1]?.pageStyle).toMatch(/overflow-wrap|word-wrap/);
  });

  it("genera barcode CODE128 visible desde codebar y conserva el código interno", () => {
    openModal(); chooseLabel();
    fireEvent.click(screen.getByRole("button", { name: /generar/i }));
    expect(vi.mocked(JsBarcode)).toHaveBeenCalledWith(expect.anything(), "7791234567890", expect.objectContaining({ format: "CODE128", displayValue: true }));
    expect(document.querySelector<HTMLElement>(".label-code")).toHaveTextContent("INT-001");
  });

  it("no altera A4 ni thermal", () => {
    expect(PRODUCT_PRINT_FORMAT_CONFIG.a4.pageStyle).toContain("@page { size: A4; margin: 5mm; }");
    expect(PRODUCT_PRINT_FORMAT_CONFIG.a4.layout.tagsPerPage).toBe(13);
    expect(PRODUCT_PRINT_FORMAT_CONFIG.thermal.pageStyle).toContain("@page { size: 55mm 65mm; margin: 0; }");
    expect(PRODUCT_PRINT_FORMAT_CONFIG.thermal.width).toBe("6.3cm");
    expect(PRODUCT_PRINT_FORMAT_CONFIG.thermal.pageStyle).not.toMatch(/landscape|45mm 55mm|55mm 45mm/);
  });
});
