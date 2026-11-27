import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

interface CreditNoteButtonProps {
  sale: Record<string, unknown>;
  createCreditNote: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

const loadButton = async () => {
  const modulePath = "@/components/Billing/CreditNoteButton";
  const module = (await import(/* @vite-ignore */ modulePath)) as { CreditNoteButton?: React.ComponentType<CreditNoteButtonProps>; default?: React.ComponentType<CreditNoteButtonProps> };
  return module.CreditNoteButton ?? module.default;
};

const eligibleSale = {
  id: "order-1", billType: "Factura B", originalCAE: "ORIGINAL-CAE", invoiceNumber: 1234,
  invoicePointOfSale: 7, total: 120, items: [{ id: "p1", description: "Producto", amount: 1.5 }],
};

describe("CreditNoteButton from sale detail", () => {
  it("shows the complete destructive confirmation and exact stock/cash effects", async () => {
    const CreditNoteButton = await loadButton();
    if (!CreditNoteButton) throw new Error("CreditNoteButton export is missing");
    render(<CreditNoteButton sale={eligibleSale} createCreditNote={vi.fn()} />);

    expect(screen.getByRole("button", { name: /nota de crédito/i })).toBeInTheDocument();
    expect(screen.getByText(/Emitir Nota de Crédito completa, restaurar stock y devolver \$120 en efectivo/i)).toBeInTheDocument();
    expect(screen.getByText(/Factura B/i)).toBeInTheDocument();
    expect(screen.getByText(/ORIGINAL-CAE/i)).toBeInTheDocument();
    expect(screen.getByText(/Producto/i)).toBeInTheDocument();
  });

  it("does not offer the action for legacy/non-fiscal or already authorized sales", async () => {
    const CreditNoteButton = await loadButton();
    if (!CreditNoteButton) throw new Error("CreditNoteButton export is missing");
    for (const sale of [
      { id: "legacy", total: 10 },
      { ...eligibleSale, billType: "Remito" },
      { ...eligibleSale, creditNote: { status: "AUTHORIZED", cae: "79999999999999" } },
    ]) {
      const { unmount } = render(<CreditNoteButton sale={sale} createCreditNote={vi.fn()} />);
      expect(screen.queryByRole("button", { name: /emitir nota de crédito/i })).toBeNull();
      unmount();
    }
  });

  it("submits once on double click, preserves the idempotency key, and distinguishes new CAE", async () => {
    const user = userEvent.setup();
    const createCreditNote = vi.fn().mockResolvedValue({ success: true, data: { creditNoteCAE: "79999999999999", creditNoteNumber: 88 } });
    const CreditNoteButton = await loadButton();
    if (!CreditNoteButton) throw new Error("CreditNoteButton export is missing");
    render(<CreditNoteButton sale={eligibleSale} createCreditNote={createCreditNote} />);

    const button = screen.getByRole("button", { name: /nota de crédito/i });
    await user.dblClick(button);
    await waitFor(() => expect(createCreditNote).toHaveBeenCalledTimes(1));
    expect(createCreditNote).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-1", confirmed: true, idempotencyKey: expect.any(String) }));
    expect(screen.getByText(/79999999999999/i)).toBeInTheDocument();
    expect(screen.getByText(/ORIGINAL-CAE/i)).toBeInTheDocument();
  });
});
