import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BillButtonsDefault from "@/components/Billing/BillButtons";
import { BillContext } from "@/context/BillContext";
import BillTypes from "@/models/billType";
import type { AfipVoucherSuccessData } from "@/services/afip/voucher-response";

vi.mock("@/actions/afip", () => ({ createAfipVoucherAction: vi.fn() }));
vi.mock("@/actions/sales", () => ({ processSaleAction: vi.fn(), updateOrderAction: vi.fn() }));
vi.mock("@/actions/shortcuts", () => ({
  getShortcutConfigsAction: vi.fn(),
  getProductByShortcutAction: vi.fn(),
}));
vi.mock("@/context/CashboxContext", () => ({
  useCashbox: () => ({ hasActiveSession: true, setIsOpeningModalOpen: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/Spinner", () => ({ default: () => <span role="status" /> }));
vi.mock("@/components/Modal", () => ({ default: () => null }));
vi.mock("@/components/ledger/ClientSelectionModal", () => ({ default: () => null }));
vi.mock("@radix-ui/react-tooltip", () => ({
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Arrow: () => null,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { createAfipVoucherAction } from "@/actions/afip";
import { processSaleAction } from "@/actions/sales";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const billState = {
  id: "",
  products: [{ id: "p-1", description: "Producto", price: 100, salePrice: 100, amount: 1 }],
  total: 100,
  totalWithDiscount: 100,
  discount: 0,
  seller: "seller@example.com",
  typeDocument: "",
  documentNumber: 0,
  IVACondition: "Consumidor Final",
  paidMethod: "Efectivo",
  twoMethods: false,
  totalSecondMethod: 0,
  billType: BillTypes.C,
  ptoVenta: 1,
  date: new Date("2026-01-01T00:00:00.000Z"),
};

function renderCheckout(dispatch = vi.fn()) {
  return render(
    <BillContext.Provider
      value={{
        BillState: billState,
        dispatch,
        onOrderResetRef: { current: null },
        printMode: "thermal",
        initialBillType: BillTypes.C,
        billTypeRef: { current: BillTypes.C },
      } as never}
    >
      <BillButtonsDefault
        session={{ user: { email: "seller@example.com", business: { features: { hasBudget: false } } } } as never}
        handlePrint={vi.fn()}
      />
    </BillContext.Provider>,
  );
}

const validCae: AfipVoucherSuccessData = {
  cae: "12345678901234",
  nroComprobante: 1,
  vencimiento: "20261231",
  qrData: "qr",
  sourcePath: "direct",
};

describe("BillButtons confirmation idempotency contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Factura: synchronous double confirmation performs one AFIP call and one persistence", async () => {
    const afip = deferred<{ success: true; data: typeof validCae }>();
    const save = deferred<{ success: true }>();
    vi.mocked(createAfipVoucherAction).mockReturnValue(afip.promise);
    vi.mocked(processSaleAction).mockReturnValue(save.promise as never);

    renderCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Facturar" }));
    const confirm = screen.getByRole("button", { name: "Confirmar" });

    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(createAfipVoucherAction).toHaveBeenCalledTimes(1);
    expect(processSaleAction).not.toHaveBeenCalled();

    await act(async () => afip.resolve({ success: true, data: validCae }));
    await waitFor(() => expect(processSaleAction).toHaveBeenCalledTimes(1));

    await act(async () => save.resolve({ success: true }));
    expect(processSaleAction).toHaveBeenCalledTimes(1);
  });

  it("Remito: synchronous double confirmation performs one persistence", async () => {
    const save = deferred<{ success: true }>();
    vi.mocked(processSaleAction).mockReturnValue(save.promise as never);

    renderCheckout();
    fireEvent.click(screen.getByRole("button", { name: "Remito" }));
    const confirm = screen.getByRole("button", { name: "Confirmar" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(createAfipVoucherAction).not.toHaveBeenCalled();
    expect(processSaleAction).toHaveBeenCalledTimes(1);

    await act(async () => save.resolve({ success: true }));
    expect(processSaleAction).toHaveBeenCalledTimes(1);
  });

  it("releases the lock after an AFIP failure, preserves the sale, and permits an explicit retry", async () => {
    vi.mocked(createAfipVoucherAction)
      .mockResolvedValueOnce({ error: "AFIP rechazó la operación" })
      .mockResolvedValueOnce({ success: true, data: validCae });
    const save = deferred<{ success: true }>();
    vi.mocked(processSaleAction).mockReturnValue(save.promise as never);
    const dispatch = vi.fn();

    renderCheckout(dispatch);
    fireEvent.click(screen.getByRole("button", { name: "Facturar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(createAfipVoucherAction).toHaveBeenCalledTimes(1));

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "removeAll" }));

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(createAfipVoucherAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(processSaleAction).toHaveBeenCalledTimes(1));
    await act(async () => save.resolve({ success: true }));
  });
});
