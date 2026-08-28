// @vitest-environment happy-dom
import React, { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ProductPrintModal, {
  PRODUCT_PRINT_FORMAT_CONFIG,
  type ProductPrintFormat,
} from "@/components/stock/product-print-modal";
import type { ProductExtended } from "@/components/stock/product-form";
import { printElement } from "@/lib/print";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange?: (open: boolean) => void }) =>
    open ? <div data-testid="dialog" data-on-open-change={Boolean(onOpenChange)}>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, type }: { children: React.ReactNode; onClick?: () => void; type?: string }) => (
    <button type={type as "button" | "submit" | "reset" | undefined} onClick={onClick}>{children}</button>
  ),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ id, checked, onCheckedChange }: { id: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) => (
    <input id={id} type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} />
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (value: string) => void }) => (
    <select aria-label="Tamaño de papel" value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
}));

vi.mock("jsbarcode", () => ({ default: vi.fn() }));
vi.mock("@/lib/print", () => ({ printElement: vi.fn().mockResolvedValue(undefined) }));

const product = (): ProductExtended => ({
  id: "editable-product",
  code: "EDT001",
  codebar: "7791234567890",
  description: "Descripción original",
  salePrice: 123,
  unit: "Unidad",
  image: null,
  imageName: null,
  brandId: null,
  categoryId: null,
  subCategoryId: null,
  price: 100,
  gain: 23,
  amount: 4,
  supplierId: null,
  businessId: "business-1",
  creation_date: new Date("2024-01-01"),
  last_update: new Date("2024-01-01"),
  client_bonus: 0,
} as ProductExtended);

const renderModal = (format: ProductPrintFormat, products = [product()]) => render(
  <ProductPrintModal open onOpenChange={vi.fn()} products={products} format={format} />
);

describe("editable-label-description step 2", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["a4", "thermal", "label-45x55"] as ProductPrintFormat[])(
    "%s enables the shared editable description layout",
    (format) => {
      expect(PRODUCT_PRINT_FORMAT_CONFIG[format].layout.editableDescription).toBe(true);
      renderModal(format);
      const description = document.querySelector<HTMLElement>(".label-description");
      expect(description).toHaveAttribute("contenteditable", "true");
      expect(description).toHaveAttribute("spellcheck", "false");
      expect(description).toHaveAttribute("title", "Haz clic para editar la descripción antes de imprimir");
    }
  );

  it.each(["a4", "thermal", "label-45x55"] as ProductPrintFormat[])(
    "%s sends the temporary DOM edit to printElement with unchanged print options",
    (format) => {
      renderModal(format);
      const description = document.querySelector<HTMLElement>(".label-description");
      const printContainer = description?.closest(".no-print")?.firstElementChild;
      if (!description || !printContainer) throw new Error("Expected printable description container");
      description.textContent = "Texto temporal para imprimir";
      fireEvent.input(description);
      fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));

      expect(printElement).toHaveBeenCalledWith(printContainer, expect.objectContaining({
        format: PRODUCT_PRINT_FORMAT_CONFIG[format].printFormat,
        pageStyle: PRODUCT_PRINT_FORMAT_CONFIG[format].pageStyle,
        ...(PRODUCT_PRINT_FORMAT_CONFIG[format].orientation ? { orientation: "landscape" } : {}),
      }));
      const printedNode = (printElement as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as HTMLElement | undefined;
      expect(printedNode).toContainElement(description);
      expect(description).toHaveTextContent("Texto temporal para imprimir");
    }
  );

  it("does not persist an edit after closing and reopening with the same product", () => {
    function ControlledModal() {
      const [open, setOpen] = useState(true);
      const inputProduct = product();
      return <>
        <button onClick={() => setOpen(false)}>Cerrar modal</button>
        <button onClick={() => setOpen(true)}>Reabrir modal</button>
        <ProductPrintModal open={open} onOpenChange={setOpen} products={[inputProduct]} />
      </>;
    }

    render(<ControlledModal />);
    const description = document.querySelector<HTMLElement>(".label-description");
    if (!description) throw new Error("Expected editable description");
    description.textContent = "Cambio que no se guarda";
    fireEvent.input(description);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar modal" }));
    expect(screen.queryByText("Cambio que no se guarda")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reabrir modal" }));
    expect(document.querySelector(".label-description")).toHaveTextContent("Descripción original");
    expect(product().description).toBe("Descripción original");
  });

  it("preserves prices, codes, copies, dimensions, and barcode ordering", () => {
    const products = [product(), { ...product(), id: "second", code: "EDT002", description: "Segunda descripción", salePrice: 90 } as ProductExtended];
    renderModal("label-45x55", products);
    const firstCard = document.querySelector<HTMLElement>(".label-container");
    if (!firstCard) throw new Error("Expected label card");
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    expect(PRODUCT_PRINT_FORMAT_CONFIG["label-45x55"]).toMatchObject({ width: "55mm", height: "45mm", orientation: "landscape" });
    expect(firstCard.style.width).not.toBe("");
    expect(firstCard.style.height).not.toBe("");
    expect(firstCard?.querySelector(".label-price")).toHaveTextContent("$120");
    expect(firstCard?.querySelector(".label-code")).toHaveTextContent("EDT001");
    const code = firstCard.querySelector(".label-code");
    const barcode = firstCard.querySelector(".label-barcode");
    expect(code && barcode && code.compareDocumentPosition(barcode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelectorAll(".label-description")).toHaveLength(2);
  });

  it.each(["a4", "thermal", "label-45x55"] as ProductPrintFormat[])(
    "%s retains its configured dimensions and product metadata",
    (format) => {
      renderModal(format);
      fireEvent.click(screen.getByRole("button", { name: "Generar" }));
      const card = document.querySelector<HTMLElement>(".label-description")?.parentElement;
      if (!card) throw new Error("Expected label card");
      const config = PRODUCT_PRINT_FORMAT_CONFIG[format];
      expect(config).toMatchObject({ width: expect.any(String), height: expect.any(String) });
      expect(card.style.width).not.toBe("");
      if (format === "label-45x55") expect(card.style.height).not.toBe("");
      expect(card.querySelector(".label-price")).toHaveTextContent("$120");
      expect(card.querySelector(".label-code")).toHaveTextContent("EDT001");
    }
  );

  it("changes paper format inside the modal while keeping the shared behavior", () => {
    renderModal("a4");
    fireEvent.change(screen.getByLabelText("Tamaño de papel"), { target: { value: "thermal" } });
    expect(document.querySelector(".label-description")).toHaveAttribute("contenteditable", "true");
    expect(PRODUCT_PRINT_FORMAT_CONFIG.thermal.width).toBe("6.3cm");
    expect(document.querySelector<HTMLElement>(".label-description")?.parentElement?.style.width).not.toBe("");
    fireEvent.change(screen.getByLabelText("Tamaño de papel"), { target: { value: "label-45x55" } });
    expect(document.querySelector(".label-description")).toHaveAttribute("contenteditable", "true");
    expect(PRODUCT_PRINT_FORMAT_CONFIG["label-45x55"].width).toBe("55mm");
    expect(document.querySelector<HTMLElement>(".label-description")?.parentElement?.style.height).not.toBe("");
  });
});
