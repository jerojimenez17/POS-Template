// @vitest-environment happy-dom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductPrintModal from "@/components/stock/product-print-modal";
import { ProductExtended } from "@/components/stock/product-form";
import { printElement } from "@/lib/print";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} onClick={onClick}>{children}</button>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label>,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) => (
    <input {...props} type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} />
  ),
}));

// A native select keeps this test focused on the modal contract, not Radix internals.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => (
    <div data-testid="format-select" data-value={value}>
      <select aria-label="Tamaño de papel" value={value} onChange={(event) => onValueChange(event.target.value)}>
        {children}
      </select>
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

vi.mock("jsbarcode", () => ({ default: vi.fn() }));
vi.mock("@/lib/print", () => ({ printElement: vi.fn().mockResolvedValue(true) }));

function product(overrides: Partial<ProductExtended> = {}): ProductExtended {
  return {
    id: "p-1", code: "INT-001", codebar: "7791234567890", description: "Producto de prueba",
    salePrice: 99.99, unit: "Unidad", image: null, imageName: null, brandId: null,
    categoryId: null, subCategoryId: null, price: 80, gain: 25, amount: 1, supplierId: null,
    businessId: "b-1", creation_date: new Date(), last_update: new Date(), client_bonus: 0,
    ...overrides,
  } as ProductExtended;
}

function openModal(props: Partial<React.ComponentProps<typeof ProductPrintModal>> = {}) {
  render(<ProductPrintModal open onOpenChange={vi.fn()} products={[product()]} {...props} />);
}

function printOptions() {
  return vi.mocked(printElement).mock.calls.at(-1)?.[1] as { format?: string; orientation?: string; pageStyle?: string } | undefined;
}

describe("ProductPrintModal — selector explícito de formatos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expone exactamente a4, thermal y label-45x55 con el label visible requerido", () => {
    openModal();
    const options = screen.getByRole("combobox", { name: "Tamaño de papel" }).querySelectorAll("option");
    expect(Array.from(options).map((option) => option.value)).toEqual(["a4", "thermal", "label-45x55"]);
    expect(screen.getByRole("option", { name: "Etiqueta (45 × 55 mm)" })).toHaveValue("label-45x55");
  });

  it("mantiene A4, su grid de tres columnas, contenido y paginación por grupos", () => {
    openModal({ products: Array.from({ length: 14 }, (_, index) => product({ id: `p-${index}`, code: `C-${index}` })) });
    const grid = document.querySelector('[style*="grid-template-columns"]');
    expect(grid).toHaveStyle("grid-template-columns: repeat(3, 6.3cm)");
    expect(document.querySelectorAll(".label-container")).toHaveLength(14);
    expect(Array.from(document.querySelectorAll<HTMLElement>("div")).filter((node) => node.style.pageBreakAfter === "always")).toHaveLength(1);
    expect(screen.getAllByText("Producto de prueba").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    const options = printOptions();
    expect(options).toEqual(expect.objectContaining({ format: "a4" }));
    expect(options?.pageStyle).toContain("@page { size: A4; margin: 5mm; }");
  });

  it("mantiene thermal 55 × 65 mm y no mezcla CSS portrait de 45 × 55", () => {
    openModal({ format: "thermal" });
    const select = screen.getByRole("combobox", { name: "Tamaño de papel" });
    expect(select).toHaveValue("thermal");
    const card = document.querySelector<HTMLElement>("[style*='width']");
    expect(card?.style.width).toBe("6.3cm");
    expect(card?.style.height).toBe("2.8cm");
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    const options = printOptions();
    expect(options).toEqual(expect.objectContaining({ format: "thermal" }));
    expect(options?.pageStyle).toContain("@page { size: 55mm 65mm; margin: 0; }");
    expect(options?.pageStyle).not.toMatch(/45mm\s+55mm|portrait|55mm\s+45mm/);
  });

  it("aplica 45 × 55 solo al elegir label-45x55, con portrait y salto por copia", () => {
    openModal();
    fireEvent.change(screen.getByRole("combobox", { name: "Tamaño de papel" }), { target: { value: "label-45x55" } });
    expect(screen.getByRole("combobox", { name: "Tamaño de papel" })).toHaveValue("label-45x55");
    const label = document.querySelector<HTMLElement>(".label-container");
    // Validate the authored inline declaration. HappyDOM normalizes physical
    // units through getComputedStyle/toHaveStyle (45mm/55mm become pixels),
    // which would produce a false negative for AC5.
    expect(label?.style.width).toBe("45mm");
    expect(label?.style.height).toBe("55mm");
    expect(label?.style.boxSizing).toBe("border-box");
    expect(label).toHaveTextContent(/Producto de prueba/);
    expect(label).toHaveTextContent(/INT-001/);
    fireEvent.click(screen.getByRole("button", { name: /generar/i }));
    expect(label?.querySelector("svg")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/copias por producto/i), { target: { value: "3" } });
    expect(document.querySelectorAll(".label-container")).toHaveLength(3);
    expect(Array.from(document.querySelectorAll<HTMLElement>(".label-container")).slice(0, 2).every((node) => node.style.pageBreakAfter === "always")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    const options = printOptions();
    expect(options).toEqual(expect.objectContaining({ format: "thermal", orientation: "portrait" }));
    expect(options?.pageStyle).toMatch(/@page\s*\{\s*size:\s*45mm 55mm portrait;\s*margin:\s*0/);
    expect(options?.pageStyle).toMatch(/html, body[^{]*\{[^}]*width:\s*45mm[^}]*height:\s*55mm/);
    expect(options?.pageStyle).toMatch(/\.no-print[^{]*\{[^}]*display:\s*none/);
    expect(options?.pageStyle).not.toMatch(/auto-fill|grid-template|landscape|55mm\s+45mm/);
  });

  it("mantiene precio opcional, fallback de barcode y overflow seguro en 45 × 55", () => {
    openModal({ products: [product({ description: "Descripción larga ".repeat(8), codebar: null, code: "7791234567890" })] });
    fireEvent.change(screen.getByRole("combobox", { name: "Tamaño de papel" }), { target: { value: "label-45x55" } });
    const label = document.querySelector<HTMLElement>(".label-container");
    expect(label).toHaveTextContent("$100");
    expect(label).toHaveTextContent("7791234567890");
    fireEvent.click(screen.getByLabelText(/mostrar precio/i));
    expect(label).not.toHaveTextContent("$100");
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    expect(printOptions()?.pageStyle).toMatch(/overflow:\s*hidden/);
    expect(printOptions()?.pageStyle).toMatch(/overflow-wrap|word-wrap/);
    expect(printOptions()?.pageStyle).toMatch(/max-width|width:\s*100%/);
  });
});
