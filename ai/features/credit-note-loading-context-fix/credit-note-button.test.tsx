import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreditNoteButton } from "@/components/Billing/CreditNoteButton";

const eligibleSale = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "sale-1",
  billType: "Factura A",
  originalCAE: "71234567890123",
  invoiceNumber: 10,
  invoicePointOfSale: 3,
  total: 1000,
  products: [{ id: "product-1", description: "Producto", amount: 1, salePrice: 1000 }],
  eligibleForFullCreditNote: true,
  ...overrides,
});

describe("CreditNoteButton", () => {
  it("renders only for the canonical eligible fiscal DTO", () => {
    const action = vi.fn().mockResolvedValue({ success: false, error: "not called" });

    render(<CreditNoteButton sale={eligibleSale()} createCreditNote={action} />);

    expect(screen.getByRole("button", { name: /revisar nota de crédito/i })).toBeInTheDocument();
  });

  it("does not reconstruct eligibility from legacy fields when the DTO is ineligible", () => {
    render(
      <CreditNoteButton
        sale={eligibleSale({ eligibleForFullCreditNote: false })}
        createCreditNote={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /nota de crédito/i })).not.toBeInTheDocument();
  });

  it("hides an authorized note and gives a non-actionable pending state", () => {
    const authorized = render(
      <CreditNoteButton
        sale={eligibleSale({ creditNote: { status: "AUTHORIZED" } })}
        createCreditNote={vi.fn()}
      />,
    );
    expect(authorized.queryByRole("button", { name: /nota de crédito/i })).not.toBeInTheDocument();

    authorized.unmount();
    render(
      <CreditNoteButton
        sale={eligibleSale({ creditNote: { status: "PENDING" } })}
        createCreditNote={vi.fn()}
      />,
    );
    expect(screen.getByText(/pendiente/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirmar devolución/i })).toBeDisabled();
  });

  it("cleans loading after a resolved failure and permits another confirmation", async () => {
    const action = vi.fn()
      .mockResolvedValueOnce({ success: false, error: "AFIP rechazó la solicitud" })
      .mockResolvedValueOnce({ success: false, error: "segundo intento" });
    const { getByRole } = render(<CreditNoteButton sale={eligibleSale()} createCreditNote={action} />);

    fireEvent.click(getByRole("button", { name: /revisar nota/i }));
    fireEvent.click(getByRole("button", { name: /confirmar devolución/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/AFIP rechazó/i));
    expect(getByRole("button", { name: /confirmar devolución/i })).not.toBeDisabled();

    fireEvent.click(getByRole("button", { name: /confirmar devolución/i }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  });

  it("cleans loading after a rejected action and allows retry", async () => {
    const action = vi.fn()
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValueOnce({ success: false, error: "retry failure" });
    render(<CreditNoteButton sale={eligibleSale()} createCreditNote={action} />);

    fireEvent.click(screen.getByRole("button", { name: /revisar nota/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar devolución/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar devolución/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /confirmar devolución/i }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  });

  it("cleans loading when invoking the action synchronously throws", async () => {
    const action = vi.fn(() => {
      throw new Error("serialization failed");
    });
    render(<CreditNoteButton sale={eligibleSale()} createCreditNote={action} />);

    fireEvent.click(screen.getByRole("button", { name: /revisar nota/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar devolución/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /confirmar devolución/i })).not.toBeDisabled());
  });

  it("allows at most one action call while the first request is pending", async () => {
    let resolve: (value: Record<string, unknown>) => void = () => undefined;
    const action = vi.fn().mockReturnValue(new Promise<Record<string, unknown>>((done) => { resolve = done; }));
    render(<CreditNoteButton sale={eligibleSale()} createCreditNote={action} />);

    fireEvent.click(screen.getByRole("button", { name: /revisar nota/i }));
    const confirm = screen.getByRole("button", { name: /confirmar devolución/i });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(action).toHaveBeenCalledTimes(1);
    resolve({ success: false, error: "controlled failure" });
    await waitFor(() => expect(confirm).not.toBeDisabled());
  });
});
