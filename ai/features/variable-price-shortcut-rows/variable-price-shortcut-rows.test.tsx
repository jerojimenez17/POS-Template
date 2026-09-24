import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render as renderWithProviders } from "../../../tests/test-utils";
import BillButtons from "@/components/Billing/BillButtons";
import PriceEditInput from "@/components/Billing/PriceEditInput";
import { BillReducer } from "@/context/BillReducer";
import { BillContext } from "@/context/BillContext";
import type { BillAction } from "@/context/billActions";
import { createAfipInvoiceDTO, createBillStateSnapshot } from "@/utils/billing";
import Product from "@/models/Product";
import type BillState from "@/models/BillState";
import * as shortcuts from "@/actions/shortcuts";
import { processSaleAction } from "@/actions/sales";
import { useCashbox } from "@/context/CashboxContext";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/actions/shortcuts", () => ({
  getShortcutConfigsAction: vi.fn(),
  getProductByShortcutAction: vi.fn(),
}));

vi.mock("@/actions/sales", () => ({
  processSaleAction: vi.fn(),
  updateOrderAction: vi.fn(),
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
    id: "cashier-1",
    email: "cashier@example.com",
    businessId: "business-1",
    business: { features: { hasBudget: false } },
  },
  expires: "2099-01-01",
};

type CartProduct = Product & { cartRowId?: string };

function createProduct(overrides: Partial<Product> & { cartRowId?: string } = {}): CartProduct {
  return Object.assign(new Product(), {
    id: "catalog-product-1",
    code: "SKU-1",
    codebar: "",
    description: "Producto variable",
    price: 100,
    salePrice: 100,
    amount: 1,
    cartRowId: undefined,
    ...overrides,
  }) as CartProduct;
}

function createBillState(products: Product[], overrides: Partial<BillState> = {}): BillState {
  return {
    id: "bill-1",
    products,
    total: products.reduce((sum, product) => sum + product.salePrice * product.amount, 0),
    totalWithDiscount: products.reduce((sum, product) => sum + product.salePrice * product.amount, 0),
    seller: "cashier@example.com",
    discount: 0,
    date: new Date("2026-10-01T12:00:00.000Z"),
    typeDocument: "DNI",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    twoMethods: false,
    paidMethod: "Efectivo",
    billType: "Remito",
    ...overrides,
  };
}

function createReducerState(products: Product[] = []): BillState {
  const total = products.reduce((sum, product) => sum + product.salePrice * product.amount, 0);
  return createBillState(products, { total, totalWithDiscount: total });
}

function addIndependentAction(product: Product): BillAction {
  // The independent-row action is part of the requested behavior but is not
  // present in the current production union. The cast keeps the red test
  // executable so a missing reducer branch fails behaviorally, not at compile time.
  return { type: "addIndependentItem", payload: product } as unknown as BillAction;
}

const shortcutProduct = () => createProduct({ id: "catalog-product-1", salePrice: 25, amount: 6 });

describe("variable-price shortcut cart rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCashbox).mockReturnValue({
      hasActiveSession: true,
      setIsOpeningModalOpen: vi.fn(),
    } as never);
    vi.mocked(shortcuts.getShortcutConfigsAction).mockResolvedValue({
      success: true,
      data: ["F1", "F2", "F3"].map((key) => ({
        id: `config-${key}`,
        key,
        productId: "catalog-product-1",
        product: { id: "catalog-product-1", description: "Producto variable", code: "SKU-1", salePrice: 25 },
      })),
    } as never);
    vi.mocked(shortcuts.getProductByShortcutAction).mockResolvedValue({
      success: true,
      data: shortcutProduct(),
    } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appends a fresh one-unit zero-price row for repeated F1/F2/F3 activations", async () => {
    const ids = [
      "shortcut-row-1",
      "shortcut-row-2",
      "shortcut-row-3",
      "shortcut-row-4",
      "shortcut-row-5",
      "shortcut-row-6",
    ];
    const randomUUID = vi.fn(() => ids.shift() ?? "unexpected-row");
    vi.stubGlobal("crypto", { randomUUID });
    const billContext = {
      BillState: createReducerState(),
      dispatch: vi.fn(),
      addItem: vi.fn(),
      addIndependentItem: vi.fn(),
      removeItem: vi.fn(),
      onOrderResetRef: { current: null },
      printMode: "thermal" as const,
      setPrintMode: vi.fn(),
      focusPriceProductId: null,
      setFocusPriceProductId: vi.fn(),
      setFocusPriceRowId: vi.fn(),
    };
    billContext.setFocusPriceRowId = billContext.setFocusPriceProductId;

    renderWithProviders(
      <BillButtons session={session as never} handlePrint={vi.fn()} isEditing={false} />,
      { billContextMock: billContext, sessionMock: session },
    );
    await waitFor(() => expect(shortcuts.getShortcutConfigsAction).toHaveBeenCalled());

    for (const key of ["F1", "F1", "F2", "F2", "F3", "F3"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true }));
    }

    await waitFor(() => expect(billContext.addIndependentItem).toHaveBeenCalledTimes(6));

    const rows = billContext.addIndependentItem.mock.calls.map(([product]) => product as CartProduct);
    expect(rows.map((row) => row.id)).toEqual(Array(6).fill("catalog-product-1"));
    expect(rows.map((row) => row.cartRowId)).toEqual([
      "shortcut-row-1", "shortcut-row-2", "shortcut-row-3",
      "shortcut-row-4", "shortcut-row-5", "shortcut-row-6",
    ]);
    expect(rows.map(({ amount, salePrice }) => ({ amount, salePrice }))).toEqual(
      Array(6).fill({ amount: 1, salePrice: 0 }),
    );
    expect(billContext.setFocusPriceProductId.mock.calls).toEqual([
      ["shortcut-row-1"],
      ["shortcut-row-2"],
      ["shortcut-row-3"],
      ["shortcut-row-4"],
      ["shortcut-row-5"],
      ["shortcut-row-6"],
    ]);
    expect(billContext.addItem).not.toHaveBeenCalled();
  });

  it("edits and removes same-catalog shortcut rows by row identity only", () => {
    const first = createProduct({ cartRowId: "row-a", salePrice: 0 });
    const second = createProduct({ cartRowId: "row-b", salePrice: 0 });
    let state = BillReducer(createReducerState(), addIndependentAction(first));
    state = BillReducer(state, addIndependentAction(second));

    state = BillReducer(state, {
      type: "updateSalePrice",
      payload: { id: "row-a", salePrice: 4000 },
    });
    state = BillReducer(state, {
      type: "updateSalePrice",
      payload: { id: "row-b", salePrice: 3400 },
    });
    expect(state.products.map(({ id, salePrice, amount }) => ({ id, salePrice, amount }))).toEqual([
      { id: "catalog-product-1", salePrice: 4000, amount: 1 },
      { id: "catalog-product-1", salePrice: 3400, amount: 1 },
    ]);
    expect(state.total).toBe(7400);

    state = BillReducer(state, {
      type: "changeUnit",
      payload: createProduct({ cartRowId: "row-b", salePrice: 3400, amount: 3 }),
    });
    expect(state.products.map(({ amount, salePrice }) => ({ amount, salePrice }))).toEqual([
      { amount: 1, salePrice: 4000 },
      { amount: 3, salePrice: 3400 },
    ]);
    expect(state.total).toBe(14200);

    state = BillReducer(state, { type: "removeItem", payload: { id: "row-a" } });
    expect(state.products).toHaveLength(1);
    expect((state.products[0] as CartProduct).cartRowId).toBe("row-b");
    expect(state.products[0].salePrice).toBe(3400);
    expect(state.products[0].amount).toBe(3);
    expect(state.total).toBe(10200);
  });

  it("focuses only the shortcut row identified by the focus request", () => {
    const setFocusPriceProductId = vi.fn();
    const context = {
      BillState: createReducerState(),
      dispatch: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      onOrderResetRef: { current: null },
      printMode: "thermal" as const,
      setPrintMode: vi.fn(),
      focusPriceProductId: "shortcut-row-b",
      setFocusPriceProductId,
    };

    render(
      <BillContext.Provider value={context as never}>
        <div>
          <PriceEditInput productId="shortcut-row-a" salePrice={0} />
          <PriceEditInput productId="shortcut-row-b" salePrice={0} />
        </div>
      </BillContext.Provider>,
    );

    expect(screen.getByRole("textbox", { name: "Precio del producto shortcut-row-b" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Precio del producto shortcut-row-a" })).toBeInTheDocument();
    expect(setFocusPriceProductId).toHaveBeenCalledWith(null);
  });

  it("keeps ordinary additions merging with ordinary rows but separate from shortcut rows", () => {
    const shortcutRow = createProduct({ cartRowId: "shortcut-row", salePrice: 4000, amount: 1 });
    let state = BillReducer(createReducerState([shortcutRow]), {
      type: "addItem",
      payload: createProduct({ salePrice: 50, amount: 2 }),
    });

    expect(state.products).toHaveLength(2);
    expect(state.products.map(({ salePrice, amount }) => ({ salePrice, amount }))).toEqual([
      { salePrice: 4000, amount: 1 },
      { salePrice: 50, amount: 2 },
    ]);

    state = BillReducer(state, {
      type: "addItem",
      payload: createProduct({ salePrice: 999, amount: 3 }),
    });
    expect(state.products).toHaveLength(2);
    expect(state.products.map(({ salePrice, amount }) => ({ salePrice, amount }))).toEqual([
      { salePrice: 4000, amount: 1 },
      { salePrice: 50, amount: 5 },
    ]);

    const legacyState = createReducerState([createProduct({ salePrice: 20, amount: 1 })]);
    const legacyResult = BillReducer(legacyState, {
      type: "addItem",
      payload: createProduct({ salePrice: 20, amount: 2 }),
    });
    expect(legacyResult.products).toHaveLength(1);
    expect(legacyResult.products[0].amount).toBe(3);
  });

  it("retains duplicate catalog lines and their own amounts/prices in checkout snapshots", () => {
    const bill = createBillState([
      createProduct({ cartRowId: "row-a", salePrice: 4000, amount: 2 }),
      createProduct({ cartRowId: "row-b", salePrice: 3400, amount: 3 }),
    ], { billType: "Factura B" });

    const snapshot = createBillStateSnapshot(bill);
    expect(snapshot.products.map(({ id, salePrice, amount }) => ({ id, salePrice, amount }))).toEqual([
      { id: "catalog-product-1", salePrice: 4000, amount: 2 },
      { id: "catalog-product-1", salePrice: 3400, amount: 3 },
    ]);
    expect((snapshot.products[0] as CartProduct).cartRowId).toBe("row-a");
    expect((snapshot.products[1] as CartProduct).cartRowId).toBe("row-b");

    const fiscalPayload = createAfipInvoiceDTO(bill);
    expect(fiscalPayload.products).toEqual([
      { id: "catalog-product-1", code: "SKU-1", description: "Producto variable", price: 100, salePrice: 4000, amount: 2 },
      { id: "catalog-product-1", code: "SKU-1", description: "Producto variable", price: 100, salePrice: 3400, amount: 3 },
    ]);
    expect(fiscalPayload.products.every((product) => !("cartRowId" in product))).toBe(true);
  });

  it("serializes checkout line items with catalog ids and without cart-row ids", async () => {
    const rows = [
      createProduct({ cartRowId: "row-a", salePrice: 4000, amount: 2 }),
      createProduct({ cartRowId: "row-b", salePrice: 3400, amount: 3 }),
    ];
    const billContext = {
      BillState: createBillState(rows, { total: 18200 }),
      dispatch: vi.fn(),
      addItem: vi.fn(),
      addIndependentItem: vi.fn(),
      removeItem: vi.fn(),
      onOrderResetRef: { current: null },
      printMode: "thermal" as const,
      setPrintMode: vi.fn(),
      focusPriceProductId: null,
      setFocusPriceProductId: vi.fn(),
    };
    vi.mocked(processSaleAction).mockResolvedValue({ success: true, orderId: "order-1" } as never);

    renderWithProviders(
      <BillButtons session={session as never} handlePrint={vi.fn()} isEditing={false} />,
      { billContextMock: billContext, sessionMock: session },
    );
    await waitFor(() => expect(shortcuts.getShortcutConfigsAction).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Remito" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Confirmar$/ }));

    await waitFor(() => expect(processSaleAction).toHaveBeenCalledTimes(1));
    const saleInput = vi.mocked(processSaleAction).mock.calls[0][0];
    expect(saleInput.products).toEqual([
      { id: "catalog-product-1", code: "SKU-1", description: "Producto variable", price: 100, salePrice: 4000, amount: 2 },
      { id: "catalog-product-1", code: "SKU-1", description: "Producto variable", price: 100, salePrice: 3400, amount: 3 },
    ]);
    expect(saleInput.products.every((product) => !("cartRowId" in product))).toBe(true);
  });
});
