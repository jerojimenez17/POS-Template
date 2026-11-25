import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SaleDetailActions from "@/components/Billing/SaleDetailActions";
import type BillState from "@/models/BillState";

vi.mock("@/components/Billing/PrintOptionsPopover", () => ({
  default: () => <button type="button">Imprimir</button>,
}));

vi.mock("@/components/Billing/InvoiceModal", () => ({
  default: () => null,
}));

const sale = (overrides: Partial<BillState> = {}): BillState => ({
  id: "sale-1",
  products: [],
  total: 100,
  totalWithDiscount: 100,
  seller: "seller@example.com",
  discount: 0,
  date: new Date("2026-10-05"),
  typeDocument: "DNI",
  documentNumber: 123,
  IVACondition: "Consumidor Final",
  twoMethods: false,
  CAE: { CAE: "12345678901234", nroComprobante: 42, ptoVenta: 7, vencimiento: "2026-10-15" },
  ...overrides,
});

describe("SaleDetailActions", () => {
  it("matches the shared invoice number format and prefers sale ptoVenta", () => {
    render(<SaleDetailActions sale={sale({ ptoVenta: 12 })} session={null} />);

    expect(screen.getByText("012-0042")).toBeInTheDocument();
    expect(screen.getByText("12345678901234")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
  });

  it("uses CAE ptoVenta as the legacy fallback and keeps no-CAE billing", () => {
    const { rerender } = render(<SaleDetailActions sale={sale()} session={null} />);

    expect(screen.getByText("007-0042")).toBeInTheDocument();

    rerender(<SaleDetailActions sale={sale({ CAE: undefined })} session={null} />);

    expect(screen.getByText("Esta venta aún no fue facturada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /facturar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
  });
});
