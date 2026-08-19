import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ClientSelectionModal from "@/components/ledger/ClientSelectionModal";

vi.mock("@/actions/clients", () => ({ createClient: vi.fn() }));
vi.mock("@/actions/unpaid-orders", () => ({
  getClientUnpaidOrders: vi.fn(), addItemsToOrder: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("lucide-react", () => ({
  Loader2: () => <span />, User: () => <span />, Search: () => <span />, Plus: () => <span />,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <section data-slot="dialog-content" className={className}>{children}</section>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <footer data-slot="dialog-footer" className={className}>{children}</footer>
  ),
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

const props = {
  open: true,
  onOpenChange: vi.fn(),
  items: [{ id: "p1", description: "Producto", salePrice: 100, amount: 1 }],
  total: 100,
  businessId: "business-1",
};

describe("ClientSelectionModal responsive layout", () => {
  it("applies a mobile viewport-safe vertical layout to all three dialogs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => [] }));
    render(<ClientSelectionModal {...props} />);
    await waitFor(() => expect(screen.getByText("Crear Orden a Cuenta")).toBeInTheDocument());

    const dialogs = document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"]');
    expect(dialogs).toHaveLength(3);
    dialogs.forEach((dialog) => {
      expect(dialog).toHaveClass("w-[calc(100%-1rem)]", "max-h-[calc(100dvh-1rem)]", "overflow-hidden", "flex", "flex-col");
      expect(dialog).toHaveClass("sm:max-w-md");
    });
  });

  it("gives each dialog an independently scrollable, shrinkable body while keeping actions outside it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => [] }));
    render(<ClientSelectionModal {...props} />);
    await waitFor(() => expect(screen.getByText("Crear Orden a Cuenta")).toBeInTheDocument());

    document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"]').forEach((dialog) => {
      const body = dialog.querySelector<HTMLElement>("header + div");
      expect(body).not.toBeNull();
      expect(body).toHaveClass("min-h-0", "overflow-y-auto");
      expect(dialog.querySelector('[data-slot="dialog-footer"]')).toBeInTheDocument();
    });
  });

  it("keeps the selected-client fields, total and confirmation reachable without horizontal overflow", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => [{ id: "client-1", name: "Cliente", cuit: "20-1", ivaCondition: "Exento" }],
    }));
    render(<ClientSelectionModal {...props} />);
    await waitFor(() => screen.getByText("Cliente").click());

    expect(screen.getByLabelText("CUIT/CUIL (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Condición IVA (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Notas / Observaciones (opcional)")).toBeInTheDocument();
    expect(screen.getByText(/Total:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"]').forEach((dialog) => {
      expect(dialog).toHaveClass("overflow-x-hidden");
    });
  });
});
