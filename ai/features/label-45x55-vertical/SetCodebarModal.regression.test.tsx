// @vitest-environment happy-dom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SetCodebarModal from "@/components/stock/set-codebar-modal";
import { updateProduct } from "@/actions/stock";
import { toast } from "sonner";

vi.mock("next/dynamic", () => ({ default: () => () => <div /> }));
vi.mock("@/actions/stock", () => ({ updateProduct: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/input", () => ({ Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));
vi.mock("@/components/ui/label", () => ({ Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label> }));

describe("SetCodebarModal regression", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps assignment validation and persistence separate from printing", async () => {
    vi.mocked(updateProduct).mockResolvedValue({} as Awaited<ReturnType<typeof updateProduct>>);
    const onSuccess = vi.fn();
    render(<SetCodebarModal productId="product-1" onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTitle("Asignar código de barras"));
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Código de Barras"), { target: { value: "7790001234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(updateProduct).toHaveBeenCalledWith("product-1", { codebar: "7790001234567" }));
    expect(toast.success).toHaveBeenCalledWith("Código de barras guardado correctamente.");
    expect(onSuccess).toHaveBeenCalledWith("7790001234567");
    expect(screen.queryByRole("button", { name: /imprimir/i })).not.toBeInTheDocument();
  });
});
