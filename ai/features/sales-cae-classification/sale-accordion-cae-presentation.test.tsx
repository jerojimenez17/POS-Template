import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type BillState from "@/models/BillState";

vi.mock("@/components/Billing/BillingModal", () => ({ default: () => null }));
vi.mock("@/components/Billing/PrintOptionsPopover", () => ({ default: () => null }));
vi.mock("@/components/DeleteButton", () => ({ default: () => null }));
vi.mock("@/components/Modal", () => ({ default: () => null }));

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
});
