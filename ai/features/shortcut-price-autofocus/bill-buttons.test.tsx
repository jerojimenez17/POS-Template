import React from "react";
import { fireEvent, render, waitFor } from "../../../tests/test-utils";
import BillButtons from "@/components/Billing/BillButtons";
import * as shortcuts from "@/actions/shortcuts";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useCashbox } from "@/context/CashboxContext";

vi.mock("@/actions/shortcuts", () => ({
  getShortcutConfigsAction: vi.fn(),
  getProductByShortcutAction: vi.fn(),
}));
vi.mock("@/context/CashboxContext", () => ({
  useCashbox: vi.fn(),
  CashboxProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

const session = {
  user: {
    id: "user-1",
    email: "cashier@example.com",
    businessId: "business-1",
    business: { features: { hasBudget: false } },
  },
  expires: "2099-01-01",
};

const product = (id: string) => ({
  id,
  code: id,
  codebar: "",
  description: `Producto ${id}`,
  brand: "",
  subCategory: "",
  price: 20,
  salePrice: 20,
  gain: 0,
  suplier: { id: "supplier", name: "Proveedor", discount: 0, iva: 0, gain: 0 },
  client_bonus: 0,
  unit: "unidades",
  image: "",
  imageName: "",
  images: [],
  amount: 8,
  last_update: new Date(),
  creation_date: new Date(),
  category: "",
  catalog: true,
  details: "",
});

const context = () => ({
  BillState: { products: [], total: 0 },
  dispatch: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
  onOrderResetRef: { current: null },
  printMode: "thermal" as const,
  setPrintMode: vi.fn(),
  qzTrayActive: false,
  setQzTrayActive: vi.fn(),
  focusPriceProductId: null,
  setFocusPriceProductId: vi.fn(),
});

const configure = (key: "F1" | "F2" | "F3", productId: string) => {
  vi.mocked(shortcuts.getShortcutConfigsAction).mockResolvedValue({
    success: true,
    data: [{ id: `config-${key}`, key, productId, product: { id: productId, description: "", code: "", salePrice: 0 } }],
  });
};

describe("BillButtons — atajos con autofoco de precio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCashbox).mockReturnValue({
      hasActiveSession: true,
      setIsOpeningModalOpen: vi.fn(),
    } as any);
  });

  it.each([
    ["F1", "prod-f1"],
    ["F2", "prod-f2"],
    ["F3", "prod-f3"],
  ] as const)("agrega %s una vez y solicita foco por productId", async (key, id) => {
    const bill = context();
    configure(key, id);
    vi.mocked(shortcuts.getProductByShortcutAction).mockResolvedValue({
      success: true,
      data: product(id),
    } as any);

    render(
      <BillButtons session={session as never} handlePrint={vi.fn()} isEditing={false} />,
      { billContextMock: bill, sessionMock: session },
    );
    await waitFor(() => expect(shortcuts.getShortcutConfigsAction).toHaveBeenCalled());

    const event = new KeyboardEvent("keydown", { key, cancelable: true });
    window.dispatchEvent(event);
    await waitFor(() => {
      expect(event.defaultPrevented).toBe(true);
      expect(bill.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ id, amount: 1, salePrice: 0 }),
      );
      expect(bill.addItem).toHaveBeenCalledTimes(1);
      expect(bill.setFocusPriceProductId).toHaveBeenCalledWith(id);
    });
  });

  it.each(["F1", "F2", "F3"] as const)(
    "previene default para %s aun sin configuración",
    async (key) => {
      const bill = context();
      vi.mocked(shortcuts.getShortcutConfigsAction).mockResolvedValue({ success: true, data: [] });
      render(
        <BillButtons session={session as never} handlePrint={vi.fn()} isEditing={false} />,
        { billContextMock: bill, sessionMock: session },
      );
      await waitFor(() => expect(shortcuts.getShortcutConfigsAction).toHaveBeenCalled());
      const event = new KeyboardEvent("keydown", { key, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(bill.addItem).not.toHaveBeenCalled();
      expect(bill.setFocusPriceProductId).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["error", { success: false, error: "fallo" }],
    ["producto eliminado", { success: true, data: null }],
  ] as const)("no agrega ni deja foco cuando hay %s", async (_label, result) => {
    const bill = context();
    configure("F1", "prod-missing");
    vi.mocked(shortcuts.getProductByShortcutAction).mockResolvedValue(result);
    render(
      <BillButtons session={session as never} handlePrint={vi.fn()} isEditing={false} />,
      { billContextMock: bill, sessionMock: session },
    );
    await waitFor(() => expect(shortcuts.getShortcutConfigsAction).toHaveBeenCalled());
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", cancelable: true }));
    await waitFor(() => expect(shortcuts.getProductByShortcutAction).toHaveBeenCalled());
    expect(bill.addItem).not.toHaveBeenCalled();
    expect(bill.setFocusPriceProductId).not.toHaveBeenCalled();
  });

  it("no procesa F1/F2/F3 sin sesión activa ni durante edición de venta", async () => {
    const bill = context();
    configure("F1", "prod-session");
      vi.mocked(useCashbox).mockReturnValue({ hasActiveSession: false, setIsOpeningModalOpen: vi.fn() } as any);
    const { unmount } = render(
      <BillButtons session={session as never} handlePrint={vi.fn()} isEditing={false} />,
      { billContextMock: bill, sessionMock: session },
    );
    await waitFor(() => expect(shortcuts.getShortcutConfigsAction).toHaveBeenCalled());
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", cancelable: true }));
    expect(shortcuts.getProductByShortcutAction).not.toHaveBeenCalled();
    expect(bill.addItem).not.toHaveBeenCalled();

    unmount();
    vi.mocked(useCashbox).mockReturnValue({ hasActiveSession: true, setIsOpeningModalOpen: vi.fn() } as any);
    render(
      <BillButtons session={session as never} handlePrint={vi.fn()} isEditing />,
      { billContextMock: bill, sessionMock: session },
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", cancelable: true }));
    expect(shortcuts.getProductByShortcutAction).not.toHaveBeenCalled();
  });
});
