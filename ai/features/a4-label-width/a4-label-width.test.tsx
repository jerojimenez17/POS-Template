// @vitest-environment happy-dom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductPrintModal, { PRODUCT_PRINT_FORMAT_CONFIG } from "@/components/stock/product-print-modal";
import { ProductExtended } from "@/components/stock/product-form";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/input", () => ({ Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));
vi.mock("@/components/ui/label", () => ({ Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label> }));
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

type A4Variant = ProductExtended & { a4Width?: "double" };

function product(overrides: Partial<A4Variant> = {}): A4Variant {
  return {
    id: "p-1", code: "INT-001", codebar: null, description: "Producto de prueba", salePrice: 100,
    unit: "Unidad", image: null, imageName: null, brandId: null, categoryId: null, subCategoryId: null,
    price: 80, gain: 25, amount: 1, supplierId: null, businessId: "b-1", creation_date: new Date(),
    last_update: new Date(), client_bonus: 0, ...overrides,
  } as A4Variant;
}

function openModal(products: A4Variant[], format: "a4" | "thermal" | "label-45x55" = "a4") {
  render(<ProductPrintModal open onOpenChange={vi.fn()} products={products} format={format} />);
}

function cards() {
  return Array.from(document.querySelectorAll<HTMLElement>(".label-container"));
}

describe("a4-label-width — paso 2 TDD", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expone el ancho A4 de 6.5cm, grilla de tres columnas y gap de 2mm", () => {
    expect(PRODUCT_PRINT_FORMAT_CONFIG.a4.width).toBe("6.5cm");
    openModal([product()]);
    const grid = document.querySelector<HTMLElement>('[style*="grid-template-columns"]');
    expect(grid).toHaveStyle("grid-template-columns: repeat(3, 6.5cm)");
    expect(grid).toHaveStyle("gap: 2mm");
  });

  it("mantiene 4.5cm sin código y las alturas existentes con código", () => {
    openModal([product({ id: "without" })]);
    expect(cards()[0].style.width).toBe("6.5cm");
    expect(cards()[0].style.minHeight).toBe("4.5cm");

    fireEvent.click(screen.getByRole("button", { name: /generar/i }));
    expect(cards()[0].style.minHeight).toBe("2.8cm");
    fireEvent.click(screen.getByLabelText(/mostrar precio/i));
    expect(cards()[0].style.minHeight).toBe("3.2cm");
  });

  it("asigna span 1 y ancho base a una etiqueta normal, y span 2 con 13.2cm a una doble", () => {
    openModal([
      product({ id: "normal", a4Width: undefined }),
      product({ id: "double", a4Width: "double" }),
    ]);
    const [normal, double] = cards();
    expect(normal.style.gridColumn).toBe("");
    expect(normal.style.width).toBe("6.5cm");
    expect(double.style.gridColumn).toBe("span 2");
    expect(double.style.width).toBe("13.2cm");
    expect(double.style.minHeight).toBe("4.5cm");
  });

  it.each([
    [9990, "normal: formatted price has five characters"],
    [9995, "double: formatted price has six characters"],
  ])("uses the deterministic formatted-price threshold (%s, %s)", (salePrice, expected) => {
    openModal([product({ salePrice })]);
    const card = cards()[0];
    if (expected.startsWith("double")) {
      expect(card.style.gridColumn).toBe("span 2");
      expect(card.style.width).toBe("13.2cm");
    } else {
      expect(card.style.gridColumn).toBe("");
      expect(card.style.width).toBe("6.5cm");
    }
  });

  it("prioriza la marca explícita a4Width double aunque el precio sea corto", () => {
    openModal([product({ salePrice: 100, a4Width: "double" })]);
    expect(cards()[0].style.gridColumn).toBe("span 2");
    expect(cards()[0].style.width).toBe("13.2cm");
  });

  it("empaqueta spans en orden, sin posición absoluta ni superposición", () => {
    openModal([
      product({ id: "d", a4Width: "double" }),
      product({ id: "n1" }),
      product({ id: "n2" }),
      product({ id: "n3" }),
    ]);
    const grids = document.querySelectorAll<HTMLElement>('[style*="grid-template-columns"]');
    expect(grids).toHaveLength(1);
    expect(cards().map((card) => card.style.gridColumn)).toEqual(["span 2", "", "", ""]);
    expect(cards().every((card) => card.style.position !== "absolute")).toBe(true);
  });

  it("respeta 13 etiquetas lógicas y el límite de 6 filas físicas en páginas mixtas", () => {
    openModal(Array.from({ length: 13 }, (_, index) => product({ id: `double-${index}`, a4Width: "double" })));
    const grids = document.querySelectorAll<HTMLElement>('[style*="grid-template-columns"]');
    expect(grids).toHaveLength(3);
    expect(Array.from(grids, (grid) => grid.querySelectorAll(".label-container").length)).toEqual([6, 6, 1]);
    expect(document.querySelectorAll(".label-container")).toHaveLength(13);
  });

  it("conserva impresión A4 y configuraciones thermal/label-45x55 sin cambios", () => {
    expect(PRODUCT_PRINT_FORMAT_CONFIG.thermal.width).toBe("6.3cm");
    expect(PRODUCT_PRINT_FORMAT_CONFIG["label-45x55"].width).toBe("55mm");
    expect(PRODUCT_PRINT_FORMAT_CONFIG["label-45x55"].height).toBe("45mm");
    expect(PRODUCT_PRINT_FORMAT_CONFIG.thermal.pageStyle).toContain("@page { size: 55mm 65mm; margin: 0; }");
    expect(PRODUCT_PRINT_FORMAT_CONFIG["label-45x55"].pageStyle).toContain("55mm 45mm landscape");

    openModal([product()], "a4");
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    expect(PRODUCT_PRINT_FORMAT_CONFIG.a4.pageStyle).toContain("@page { size: A4; margin: 5mm; }");
  });
});
