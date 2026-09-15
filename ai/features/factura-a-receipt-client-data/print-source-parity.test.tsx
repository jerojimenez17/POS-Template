import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PrintableTable from "@/components/Billing/PrintableTable";
import PrintOptionsPopover from "@/components/Billing/PrintOptionsPopover";
import { BillContext } from "@/context/BillContext";
import type BillState from "@/models/BillState";

const { printThermalReceipt } = vi.hoisted(() => ({
  printThermalReceipt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/print", () => ({
  printThermalReceipt,
  exportToPDF: vi.fn(),
  buildPDFHTML: vi.fn(() => "<div />"),
  PDF_STYLES: "",
}));
vi.mock("@/actions/business", () => ({
  getBusinessBillingInfoAction: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/components/Billing/ProductSearchBar", () => ({ default: () => null }));
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "", subsets: [], weight: [], variable: "" }) }));

const sale: BillState = {
  id: "sale-1",
  products: [],
  total: 100,
  totalWithDiscount: 100,
  seller: "Seller",
  discount: 0,
  date: new Date("2026-01-02T12:00:00.000Z"),
  typeDocument: "DNI",
  clientDocumentType: "CUIT",
  documentNumber: 0,
  IVACondition: "Responsable Inscripto",
  twoMethods: false,
  paidMethod: "Efectivo",
  client: "ACME",
  clientIvaCondition: "responsable_inscripto",
  clientDocumentNumber: "00123456789",
};

const session = { user: { businessName: "Business", email: "seller@example.com" } };

function renderPrintable(printTrigger: number) {
  return render(
    <BillContext.Provider value={{
      BillState: sale,
      dispatch: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      onOrderResetRef: { current: null },
      printMode: "thermal",
      setPrintMode: vi.fn(),
      qzTrayEnabled: false,
    }}>
      <PrintableTable printTrigger={printTrigger} className="" handleClose={vi.fn()} session={session as never} />
    </BillContext.Provider>,
  );
}

describe("receipt print source parity", () => {
  it("passes the same client tax snapshot from immediate PrintableTable and historical PrintOptionsPopover sources", async () => {
    const printable = renderPrintable(0);
    printable.rerender(
      <BillContext.Provider value={{
        BillState: sale,
        dispatch: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), onOrderResetRef: { current: null },
        printMode: "thermal", setPrintMode: vi.fn(), qzTrayEnabled: false,
      }}>
        <PrintableTable printTrigger={1} className="" handleClose={vi.fn()} session={session as never} />
      </BillContext.Provider>,
    );
    await waitFor(() => expect(printThermalReceipt).toHaveBeenCalledTimes(1));
    const immediateData = printThermalReceipt.mock.calls[0][0];

    render(<PrintOptionsPopover sale={sale} session={session as never} />);
    const popoverTrigger = screen.getAllByRole("button").at(-1);
    expect(popoverTrigger).toBeDefined();
    fireEvent.pointerDown(popoverTrigger as HTMLElement);
    fireEvent.click(await screen.findByText("Impresión Térmica"));
    await waitFor(() => expect(printThermalReceipt).toHaveBeenCalledTimes(2));
    const historicalData = printThermalReceipt.mock.calls[1][0];

    expect(historicalData).toEqual(expect.objectContaining({
      documentType: immediateData.documentType,
      client: immediateData.client,
      clientIvaCondition: immediateData.clientIvaCondition,
      clientDocumentNumber: immediateData.clientDocumentNumber,
    }));
  });
});
