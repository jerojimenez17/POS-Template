import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  process: vi.fn(),
  update: vi.fn(),
  business: vi.fn(),
  dispatch: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@/actions/afip", () => ({ createAfipVoucherAction: mocks.create }));
vi.mock("@/actions/sales", () => ({ processSaleAction: mocks.process, updateOrderAction: vi.fn() }));
vi.mock("@/actions/sales/update", () => ({ updateOrderCaeAction: mocks.update }));
vi.mock("@/actions/business", () => ({ getBusinessBillingInfoAction: mocks.business }));
vi.mock("@/actions/shortcuts", () => ({ getShortcutConfigsAction: vi.fn().mockResolvedValue({}), getProductByShortcutAction: vi.fn() }));
vi.mock("@/actions/budget", () => ({ createBudgetAction: vi.fn() }));
vi.mock("@/components/ledger/ClientSelectionModal", () => ({ default: () => null }));
vi.mock("@/context/CashboxContext", () => ({ useCashbox: () => ({ hasActiveSession: true, setIsOpeningModalOpen: vi.fn() }) }));
vi.mock("@/hooks/useFeatures", () => ({ useFeatures: () => ({ hasFeature: () => true, isDelinquent: false, plan: "ENTERPRISE" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

import BillButtonsDefault from "@/components/Billing/BillButtons";
import BillingModal from "@/components/Billing/BillingModal";
import { BillContext } from "@/context/BillContext";

const caeData = {
  cae: "12345678901234", vencimiento: "20261231", nroComprobante: 42,
  qrData: "qr", ptoVenta: 7, sourcePath: "data.afip",
};

const sale = {
  id: "sale-1", products: [{ id: "p1", code: "P1", description: "Producto", price: 100, salePrice: 100, amount: 1 }],
  total: 100, totalWithDiscount: 100, seller: "seller", discount: 0,
  date: new Date("2026-08-21T10:00:00Z"), typeDocument: "Consumidor Final",
  documentNumber: 0, IVACondition: "Consumidor Final", twoMethods: false,
  ptoVenta: 7, billType: "Factura B" as const,
};

const context = {
  BillState: sale, dispatch: mocks.dispatch, onOrderResetRef: { current: mocks.reset },
  printMode: "thermal" as const, setFocusPriceProductId: vi.fn(), addItem: vi.fn(),
  initialBillType: "Factura B", billTypeRef: { current: "Factura B" },
};

describe("AFIP consumers share canonical CAE contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.business.mockResolvedValue({ condicionIva: "Responsable Inscripto" });
  });

  it("BillButtons does not save, print, or reset after an unauthorized AFIP result", async () => {
    mocks.create.mockResolvedValue({ error: "La Cloud Function respondió sin un CAE válido" });
    const print = vi.fn();
    render(<BillButtonsDefault session={{ user: { email: "cashier@example.test", business: { features: { hasBudget: false } } } } as never} handlePrint={print} />, { wrapper: ({ children }) => <BillContext.Provider value={context as never}>{children}</BillContext.Provider>, });

    // Merged BillButtons flow (report-B): the toolbar button carries a
    // <kbd>F4</kbd> hint (accessible name "FacturarF4") and only OPENS the
    // CheckoutModal. Its confirm button is named exactly "Facturar" and lives
    // inside a real Radix Dialog, so it is NOT present until the modal opens
    // — a single pre-open query can never reach it. Click opener, then confirm.
    fireEvent.click(screen.getAllByRole("button", { name: /Facturar/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.process).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it("BillButtons persists once and prints only after canonical CAE success", async () => {
    mocks.create.mockResolvedValue({ success: true, data: caeData });
    mocks.process.mockResolvedValue({ success: true });
    const print = vi.fn();
    render(<BillButtonsDefault session={{ user: { email: "cashier@example.test", business: { features: { hasBudget: false } } } } as never} handlePrint={print} />, { wrapper: ({ children }) => <BillContext.Provider value={context as never}>{children}</BillContext.Provider>, });
    // Same merged contract (report-B): toolbar "FacturarF4" opens the modal;
    // its exact-name "Facturar" confirm only exists while the Radix dialog is
    // open, so confirm with a second, awaited click.
    fireEvent.click(screen.getAllByRole("button", { name: /Facturar/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Facturar" }));
    await waitFor(() => expect(mocks.process).toHaveBeenCalledTimes(1));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("BillingModal persists the same canonical success shape without reading data.afip", async () => {
    mocks.create.mockResolvedValue({ success: true, data: caeData });
    mocks.update.mockResolvedValue({ success: true });
    render(<BillingModal open onOpenChange={vi.fn()} sale={sale as never} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Facturar" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update).toHaveBeenCalledWith("sale-1", expect.objectContaining({ CAE: expect.objectContaining({ CAE: caeData.cae }) }));
  });
});
