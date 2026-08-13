import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import PrintOptionsPopover from "../../../src/components/Billing/PrintOptionsPopover";

const { printThermalReceipt } = vi.hoisted(() => ({
  printThermalReceipt: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../src/lib/print", () => ({
  printThermalReceipt,
  buildPDFHTML: vi.fn(() => "<div />"),
  exportToPDF: vi.fn(),
  PDF_STYLES: "",
}));
vi.mock("../../../src/actions/business", () => ({
  getBusinessBillingInfoAction: vi.fn().mockResolvedValue({ address: "Dirección vigente" }),
}));
vi.mock("qrcode", () => ({ default: { toString: vi.fn().mockResolvedValue("<svg />") } }));

describe("historical printing", () => {
  it("uses the approved historical default QZ=false, never a browser selector", async () => {
    const sale = {
      id: "sale-1", date: new Date(), products: [], total: 0, totalWithDiscount: 0,
      discount: 0, billType: "Factura", CAE: { CAE: "CAE-1", vencimiento: "" },
    } as never;

    render(<PrintOptionsPopover sale={sale} session={{ user: { businessName: "Demo" } } as never} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Impresión Térmica"));

    await waitFor(() => expect(printThermalReceipt).toHaveBeenCalledWith(expect.anything(), false));
  });

  it("keeps PDF independent from QZ and passes settings through the historical composition", async () => {
    const popover = await readFile(path.join(process.cwd(), "src/components/Billing/PrintOptionsPopover.tsx"), "utf8");
    const salesTable = await readFile(path.join(process.cwd(), "src/components/Billing/SalesTable.tsx"), "utf8");
    const searchBill = await readFile(path.join(process.cwd(), "src/app/(protected)/searchBill/page.tsx"), "utf8");

    expect(popover).toMatch(/qzTrayEnabled/);
    expect(popover).toMatch(/printThermalReceipt\([^,]+,\s*qzTrayEnabled\)/);
    expect(salesTable).toMatch(/qzTrayEnabled/);
    expect(searchBill).toMatch(/getBusinessPrintSettingsAction/);
  });
});
