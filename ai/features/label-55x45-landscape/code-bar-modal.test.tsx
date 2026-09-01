// @vitest-environment happy-dom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CodeBarModal from "@/components/stock/code-bar-modal";
import JsBarcode from "jsbarcode";
import { printElement } from "@/lib/print";

vi.mock("@/components/ui/dialog", () => {
  let openDialog: ((open: boolean) => void) | undefined;
  return {
    Dialog: ({ children, onOpenChange }: { children: React.ReactNode; onOpenChange: (open: boolean) => void }) => { openDialog = onOpenChange; return <div>{children}</div>; },
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>, DialogTrigger: ({ children }: { children: React.ReactNode }) => <div data-testid="trigger" onClick={() => openDialog?.(true)}>{children}</div>,
  };
});
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));
vi.mock("@/components/ui/input", () => ({ Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));
vi.mock("@/components/ui/label", () => ({ Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label> }));
vi.mock("@/components/ui/checkbox", () => ({ Checkbox: ({ checked, onCheckedChange, ...props }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) => <input {...props} type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} /> }));
vi.mock("jsbarcode", () => ({ default: vi.fn() })); vi.mock("@/lib/print", () => ({ printElement: vi.fn().mockResolvedValue(true) }));

const props = { code: "INT-001", codebar: "7791234567890", description: "Producto de prueba", salePrice: 99.99, unit: "Unidad" };
function openModal() { render(<CodeBarModal {...props} />); fireEvent.click(screen.getByTestId("trigger")); }

describe("CodeBarModal — semántica compartida 55 × 45 landscape", () => {
  beforeEach(() => vi.clearAllMocks());
  it("renderiza 55mm × 45mm y conserva contenido/precio/copies", () => {
    openModal(); const label = document.querySelector<HTMLElement>(".label-container");
    expect(label?.style.width).toBe("55mm"); expect(label?.style.height).toBe("45mm"); expect(label?.style.boxSizing).toBe("border-box"); expect(label).toHaveTextContent(/Producto de prueba/); expect(label).toHaveTextContent("INT-001"); expect(label).toHaveTextContent("$100");
    fireEvent.change(screen.getByLabelText(/cantidad de copias/i), { target: { value: "3" } }); expect(document.querySelectorAll(".label-container")).toHaveLength(3);
  });
  it("imprime thermal landscape con CSS físico, ayuda horizontal y fallback", async () => {
    openModal(); fireEvent.click(screen.getByRole("button", { name: /imprimir/i })); await Promise.resolve();
    const options = vi.mocked(printElement).mock.calls[0]?.[1]; expect(options).toEqual(expect.objectContaining({ format: "thermal", orientation: "landscape", fallbackToPDF: true })); expect(options?.pageStyle).toMatch(/55mm 45mm landscape/); expect(options?.pageStyle).not.toMatch(/45mm 55mm|portrait/); expect(screen.getByText(/orientación horizontal|landscape/i)).toBeInTheDocument();
  });
  it("usa CODE128 con displayValue y permite fallback al código interno", () => {
    openModal(); expect(vi.mocked(JsBarcode)).toHaveBeenCalledWith(expect.anything(), props.code, expect.objectContaining({ format: "CODE128", displayValue: true })); fireEvent.click(screen.getByRole("button", { name: new RegExp(`Código de barras: ${props.codebar}`) })); expect(vi.mocked(JsBarcode)).toHaveBeenLastCalledWith(expect.anything(), props.codebar, expect.objectContaining({ format: "CODE128", displayValue: true }));
  });
});
