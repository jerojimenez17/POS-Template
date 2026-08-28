// @vitest-environment happy-dom
import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CodeBarModal from "@/components/stock/code-bar-modal";
import JsBarcode from "jsbarcode";
import { printElement } from "@/lib/print";

vi.mock("@/components/ui/dialog", () => {
  let dialogOpen = false;
  let onOpenChange: ((open: boolean) => void) | undefined;
  return {
    Dialog: ({ open, onOpenChange: change, children }: { open: boolean; onOpenChange: (value: boolean) => void; children: React.ReactNode }) => {
      dialogOpen = open;
      onOpenChange = change;
      return <div>{children}</div>;
    },
    DialogContent: ({ children }: { children: React.ReactNode }) => dialogOpen ? <div>{children}</div> : null,
    DialogFooter: ({ children }: { children: React.ReactNode }) => dialogOpen ? <div>{children}</div> : null,
    DialogHeader: ({ children }: { children: React.ReactNode }) => dialogOpen ? <div>{children}</div> : null,
    DialogTitle: ({ children }: { children: React.ReactNode }) => dialogOpen ? <h2>{children}</h2> : null,
    DialogTrigger: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-trigger" onClick={() => onOpenChange?.(true)}>{children}</div>
    ),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: { children: React.ReactNode; onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void }) => (
    <button {...props} onClick={onClick}>{children}</button>
  ),
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

vi.mock("jsbarcode", () => ({ default: vi.fn() }));
vi.mock("@/lib/print", () => ({ printElement: vi.fn().mockResolvedValue(true) }));

const props = {
  code: "INT-001",
  codebar: "7791234567890",
  description: "Producto de prueba",
  salePrice: 99.99,
  unit: "Unidad",
};

function renderOpen() {
  render(<CodeBarModal {...props} />);
  fireEvent.click(screen.getByTestId("dialog-trigger"));
}

function labels() {
  return Array.from(document.querySelectorAll<HTMLElement>(".label-container"));
}

function expectAuthoredLabelSize(label: HTMLElement) {
  expect(label.style.width).toBe("45mm");
  expect(label.style.height).toBe("55mm");
}

describe("CodeBarModal — etiqueta individual 45 × 55 mm portrait", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders every label at exactly 45mm × 55mm, regardless of barcode availability", () => {
    renderOpen();
    expect(labels()).toHaveLength(1);
    expectAuthoredLabelSize(labels()[0]);

    cleanup();
    render(<CodeBarModal {...props} codebar="" />);
    fireEvent.click(screen.getByTestId("dialog-trigger"));
    expectAuthoredLabelSize(labels()[0]);
  });

  it("prints with the exact portrait page, thermal format, and safe print CSS", async () => {
    renderOpen();
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    await Promise.resolve();

    const options = vi.mocked(printElement).mock.calls[0]?.[1];
    expect(options).toEqual(expect.objectContaining({ format: "thermal", orientation: "portrait" }));
    expect(options?.fallbackToPDF).not.toBe(false);
    expect(options?.pageStyle).toMatch(/@page\s*\{\s*size:\s*45mm 55mm portrait;\s*margin:\s*0;\s*\}/);
    expect(options?.pageStyle).toContain("html, body");
    expect(options?.pageStyle).toContain("width: 45mm");
    expect(options?.pageStyle).toContain("height: 55mm");
    expect(options?.pageStyle).toContain("overflow: hidden");
    expect(options?.pageStyle).toMatch(/\.no-print\s*\{[^}]*display:\s*none/);
    expect(options?.pageStyle).toContain("page-break-after");
    expect(options?.pageStyle).not.toMatch(/landscape|55mm\s+45mm|auto-fill|grid-template/i);
    expect(screen.getByText(/escala 100%|márgenes ninguno|orientación vertical/i)).toBeInTheDocument();
  });

  it("keeps description, internal code, and barcode in order and makes price optional", () => {
    renderOpen();
    const label = labels()[0];
    expect(label.textContent).toContain(props.description);
    expect(label.textContent).toContain(props.code);
    expect(label.textContent).toContain("$100");
    expect(label.querySelector("svg")).toBeInTheDocument();
    expect(label.textContent!.indexOf(props.description)).toBeLessThan(label.textContent!.indexOf(props.code));

    fireEvent.click(screen.getByLabelText(/mostrar precio/i));
    expect(labels()[0].textContent).not.toContain("$100");
  });

  it("generates CODE128 from the selected source, falling back to internal code", () => {
    renderOpen();
    expect(vi.mocked(JsBarcode)).toHaveBeenCalledWith(expect.anything(), props.code, expect.objectContaining({ format: "CODE128", displayValue: true }));

    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Código de barras: ${props.codebar}`) }));
    expect(vi.mocked(JsBarcode)).toHaveBeenLastCalledWith(expect.anything(), props.codebar, expect.objectContaining({ format: "CODE128", displayValue: true }));

    cleanup();
    render(<CodeBarModal {...props} codebar="" />);
    fireEvent.click(screen.getByTestId("dialog-trigger"));
    expect(vi.mocked(JsBarcode)).toHaveBeenLastCalledWith(expect.anything(), props.code, expect.anything());
  });

  it("renders 1–50 copies, clamps out-of-range values, and separates copies for printing", () => {
    renderOpen();
    const input = screen.getByLabelText(/cantidad de copias/i);
    fireEvent.change(input, { target: { value: "50" } });
    expect(labels()).toHaveLength(50);
    fireEvent.change(input, { target: { value: "99" } });
    expect(labels()).toHaveLength(50);
    fireEvent.change(input, { target: { value: "0" } });
    expect(labels()).toHaveLength(1);

    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    const options = vi.mocked(printElement).mock.calls.at(-1)?.[1];
    expect(options?.pageStyle).toMatch(/page-break-(after|before|inside)/);
  });

  it("uses bounded, overflow-safe physical CSS for long descriptions and typical barcodes", async () => {
    render(<CodeBarModal {...props} description={"Descripción muy larga ".repeat(8)} codebar="7791234567890" />);
    fireEvent.click(screen.getByTestId("dialog-trigger"));
    const label = labels()[0];
    expectAuthoredLabelSize(label);
    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));
    await Promise.resolve();
    const style = vi.mocked(printElement).mock.calls.at(-1)?.[1]?.pageStyle ?? "";
    expect(style).toMatch(/overflow:\s*hidden/);
    expect(style).toMatch(/word-wrap|overflow-wrap|white-space/);
    expect(style).toMatch(/max-width|width:\s*100%/);
  });
});
