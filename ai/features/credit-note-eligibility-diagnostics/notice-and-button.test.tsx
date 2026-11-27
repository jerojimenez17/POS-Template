import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CreditNoteEligibilityNotice from "@/components/Billing/CreditNoteEligibilityNotice";
import { CreditNoteButton } from "@/components/Billing/CreditNoteButton";

describe("credit-note eligibility presentation", () => {
  it.each([
    ["CAE_INVALID", "No se puede emitir la Nota de Crédito porque los datos fiscales no son válidos o son inconsistentes. Revisá el comprobante original."],
    ["FISCAL_FIELDS_INCOMPLETE", "Los datos fiscales de la venta están incompletos y no permiten ofrecer una Nota de Crédito. Revisá los datos fiscales."],
    ["FISCAL_TYPE_CONFLICT", "No se puede emitir la Nota de Crédito porque los datos fiscales no son válidos o son inconsistentes. Revisá el comprobante original."],
    ["FISCAL_TYPE_UNSUPPORTED", "El tipo de comprobante de la venta no permite ofrecer una Nota de Crédito."],
    ["ALREADY_AUTHORIZED", "La venta ya tiene una Nota de Crédito autorizada."],
    ["SALE_CONTENT_INCOMPLETE", "La venta no tiene un detalle completo para ofrecer una Nota de Crédito."],
  ] as const)("renders fixed safe copy for %s without sensitive values", (reason, message) => {
    render(<CreditNoteEligibilityNotice diagnostic={{ status: reason === "ALREADY_AUTHORIZED" || reason === "SALE_CONTENT_INCOMPLETE" ? "INELIGIBLE" : "INVALID_OR_INCOMPLETE", reason, message }}/>);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(message);
    expect(notice).toHaveTextContent(/no permite|no permiten|no tiene|no se puede/i);
    expect(notice).not.toHaveTextContent(/71234567890123|ORIGINAL-CAE|qr|token|secret|private/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the CreditNoteButton for an eligible canonical sale", () => {
    render(<CreditNoteButton sale={{
      orderId: "sale-eligible",
      billType: "Factura A",
      originalAfipVoucherType: 1,
      originalCAE: "71234567890123",
      invoiceNumber: 10,
      invoicePointOfSale: 3,
      total: 1000,
      products: [{ id: "p1", description: "Producto", amount: 1, salePrice: 1000 }],
      creditNote: null,
      eligibleForFullCreditNote: true,
    }} createCreditNote={vi.fn()} />);
    expect(screen.getByRole("button", { name: /revisar nota de crédito/i })).toBeInTheDocument();
  });
});
