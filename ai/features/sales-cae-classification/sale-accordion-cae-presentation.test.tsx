import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type BillState from "@/models/BillState";

vi.mock("@/components/Billing/BillingModal", () => ({ default: () => null }));
vi.mock("@/components/Billing/PrintOptionsPopover", () => ({ default: () => null }));
vi.mock("@/components/DeleteButton", () => ({ default: () => null }));
vi.mock("@/components/Modal", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/actions/sales/credit-note", () => ({ createCreditNoteAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SaleAccordion from "@/components/Billing/SaleAccordion";

const sale = (overrides: Partial<BillState> = {}): BillState => ({
  id: "sale-presentation",
  products: [],
  total: 1200,
  totalWithDiscount: 1200,
  seller: "seller@example.com",
  discount: 0,
  date: new Date("2026-01-15T12:00:00.000Z"),
  typeDocument: "",
  documentNumber: 0,
  IVACondition: "Consumidor Final",
  twoMethods: false,
  billType: "Factura B",
  ...overrides,
});

describe("sales search row official-versus-remito presentation", () => {
  it("presents a valid CAE as an invoice even when fiscal billType says Remito", () => {
    render(<SaleAccordion
      sale={sale({
        billType: "Remito",
        CAE: { CAE: "71234567890123", nroComprobante: 42, vencimiento: "20261231", qrData: "qr", ptoVenta: 7 },
        ptoVenta: 7,
      })}
      session={null}
    />);

    expect(screen.getByText("007-0042")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Facturar" })).not.toBeInTheDocument();
  });

  it.each([
    ["placeholder", "SIN CAE"],
    ["malformed short value", "123"],
    ["malformed alphanumeric value", "71234567890ABC"],
  ])("presents a %s as Remito even when fiscal billType says Factura", (_label, cae) => {
    render(<SaleAccordion
      sale={sale({
        billType: "Factura B",
        CAE: { CAE: cae, nroComprobante: 42, vencimiento: "20261231", qrData: "qr", ptoVenta: 7 },
      })}
      session={null}
    />);

    expect(screen.getByRole("button", { name: "Facturar" })).toBeInTheDocument();
    expect(screen.queryByText("007-0042")).not.toBeInTheDocument();
  });

  it("opens the credit-note modal, asks for confirmation and toasts after issuing", async () => {
    const { createCreditNoteAction } = await import("@/actions/sales/credit-note");
    vi.mocked(createCreditNoteAction).mockResolvedValue({
      success: true,
      data: { creditNoteCAE: "71234567890124", creditNoteNumber: 1, creditNotePointOfSale: 7 },
    });
    const { toast } = await import("sonner");

    render(<SaleAccordion
      sale={sale({
        CAE: { CAE: "71234567890123", nroComprobante: 42, vencimiento: "20261231", qrData: "qr", ptoVenta: 7 },
        ptoVenta: 7,
        fiscalContext: {
          orderId: "sale-presentation",
          billType: "Factura B",
          originalAfipVoucherType: 6,
          originalCAE: "71234567890123",
          invoiceNumber: 42,
          invoicePointOfSale: 7,
          total: 1200,
          products: [],
          creditNote: null,
          eligibleForFullCreditNote: true,
        },
      })}
      session={{ user: { role: "ADMIN" } } as never}
    />);

    fireEvent.click(screen.getByRole("button", { name: /nota de crédito/i }));
    expect(await screen.findByText("Emitir Nota de Crédito")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirmar nota de crédito/i }));

    await waitFor(() => expect(createCreditNoteAction).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "sale-presentation", confirmed: true }),
    ));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Devolución realizada")));
  });
});
