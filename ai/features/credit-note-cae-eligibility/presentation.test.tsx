import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreditNoteButton } from "@/components/Billing/CreditNoteButton";

const sale = (eligibleForFullCreditNote: boolean, status?: "PENDING" | "AUTHORIZED" | "REJECTED") => ({
  orderId: "sale-1", billType: "Factura B" as const, originalAfipVoucherType: 6 as const, originalCAE: "71234567890123", invoiceNumber: 42, invoicePointOfSale: 7,
  total: 100, products: [{ id: "p1", description: "Producto", amount: 1, salePrice: 100 }], creditNote: status ? { status } : null, eligibleForFullCreditNote,
});

describe("CreditNoteButton eligibility barrier", () => {
  it("renders exactly one actionable option only for eligible sales", () => {
    render(<CreditNoteButton sale={sale(true)} createCreditNote={vi.fn()} />);
    expect(screen.getByRole("button", { name: /revisar nota de crédito/i })).toBeInTheDocument();
  });

  it.each([false, undefined])("renders no button for an ineligible or diagnostic-only sale (%s)", (eligible) => {
    render(<CreditNoteButton sale={{ ...sale(Boolean(eligible)), eligibleForFullCreditNote: eligible }} createCreditNote={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each(["PENDING", "AUTHORIZED"] as const)("does not offer a second emission for %s returns", (status) => {
    render(<CreditNoteButton sale={sale(true, status)} createCreditNote={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /revisar nota de crédito/i })).not.toBeInTheDocument();
  });
});
