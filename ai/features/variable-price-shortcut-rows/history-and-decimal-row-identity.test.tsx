import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DecimalInput from "@/components/Billing/DecimalInput";
import { mapOrderToBillState } from "@/actions/sales/history";
import { BillReducer } from "@/context/BillReducer";
import type { BillAction } from "@/context/billActions";
import Product from "@/models/Product";
import type BillState from "@/models/BillState";
import { getBillRowId } from "@/utils/bill-row";

type CartProduct = Product & { cartRowId?: string };

const historicalOrder = () => ({
  id: "sale-with-repeated-product-lines",
  date: new Date("2026-10-20T12:00:00.000Z"),
  businessId: "business-1",
  total: 900,
  discountAmount: 0,
  discountPercentage: 0,
  seller: "cashier@example.com",
  paidStatus: "pago",
  paymentMethod: "Efectivo",
  paymentMethod2: null,
  totalMethod2: null,
  clientId: null,
  client: null,
  clientDocumentNumber: null,
  clientDocumentType: null,
  clientIvaCondition: null,
  CAE: null,
  items: [
    {
      id: "order-item-1",
      productId: "catalog-product-1",
      code: "SKU-1",
      description: "Producto variable",
      costPrice: 100,
      price: 400,
      quantity: 2,
    },
    {
      id: "order-item-2",
      productId: "catalog-product-1",
      code: "SKU-1",
      description: "Producto variable",
      costPrice: 100,
      price: 500,
      quantity: 1,
    },
  ],
});

const mapHistoricalOrder = () => mapOrderToBillState(historicalOrder() as never);

const changeUnitAction = (product: Product): BillAction => ({
  type: "changeUnit",
  payload: product,
});

describe("historical and decimal variable-price row identity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates duplicate persisted product lines with deterministic distinct row ids and retains catalog identity", () => {
    const ids = ["history-row-1", "history-row-2"];
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => ids.shift() ?? "unexpected-row") });

    const hydrated = mapHistoricalOrder();
    const rows = hydrated.products as CartProduct[];

    expect(rows.map(({ id, cartRowId, salePrice, amount }) => ({ id, cartRowId, salePrice, amount }))).toEqual([
      { id: "catalog-product-1", cartRowId: "history-row-1", salePrice: 400, amount: 2 },
      { id: "catalog-product-1", cartRowId: "history-row-2", salePrice: 500, amount: 1 },
    ]);
    expect(new Set(rows.map(({ cartRowId }) => cartRowId)).size).toBe(2);
  });

  it("updates the selected historical line price without changing its same-product sibling", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValueOnce("history-row-1").mockReturnValueOnce("history-row-2"),
    });
    const hydrated = mapHistoricalOrder();
    const rows = hydrated.products as CartProduct[];
    const firstRowId = rows[0]?.cartRowId ?? "history-row-1";
    const state = BillReducer(hydrated, {
      type: "updateSalePrice",
      payload: { id: firstRowId, salePrice: 450 },
    });

    expect(state.products.map(({ id, salePrice }) => ({ id, salePrice }))).toEqual([
      { id: "catalog-product-1", salePrice: 450 },
      { id: "catalog-product-1", salePrice: 500 },
    ]);
    expect(state.products.map((product) => (product as CartProduct).cartRowId)).toEqual([
      "history-row-1",
      "history-row-2",
    ]);
  });

  it("changes a historical line quantity and removes only that line", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValueOnce("history-row-1").mockReturnValueOnce("history-row-2"),
    });
    const hydrated = mapHistoricalOrder();
    const rows = hydrated.products as CartProduct[];
    const firstRowId = rows[0]?.cartRowId ?? "history-row-1";
    const secondRowId = rows[1]?.cartRowId ?? "history-row-2";
    let state = hydrated;
    const secondRow = state.products[1] as CartProduct;
    state = BillReducer(state, changeUnitAction({ ...secondRow, cartRowId: secondRowId, amount: 1.5 }));

    expect(state.products.map(({ amount }) => amount)).toEqual([2, 1.5]);
    state = BillReducer(state, { type: "removeItem", payload: { id: firstRowId } });

    expect(state.products).toHaveLength(1);
    expect(state.products[0]).toMatchObject({
      id: "catalog-product-1",
      cartRowId: "history-row-2",
      salePrice: 500,
      amount: 1.5,
    });
    expect(state.total).toBe(750);
  });

  it("updates a fractional shortcut quantity by cart-row id, leaving the same-catalog sibling unchanged", () => {
    const edited = Object.assign(new Product(), {
      id: "catalog-product-1",
      cartRowId: "shortcut-row-a",
      amount: 1.25,
      salePrice: 400,
      unit: "kg",
    }) as CartProduct;
    const sibling = Object.assign(new Product(), {
      id: "catalog-product-1",
      cartRowId: "shortcut-row-b",
      amount: 3.5,
      salePrice: 900,
      unit: "kg",
    }) as CartProduct;
    let state: BillState = {
      id: "bill-1",
      products: [edited, sibling],
      total: 3650,
      totalWithDiscount: 3650,
      seller: "cashier@example.com",
      discount: 0,
      date: new Date("2026-10-20T12:00:00.000Z"),
      typeDocument: "DNI",
      documentNumber: 0,
      IVACondition: "Consumidor Final",
      twoMethods: false,
      paidMethod: "Efectivo",
      billType: "Remito",
    };

    const updateAmount = (rowId: string, amount: number) => {
      const target = state.products.find((product) => getBillRowId(product) === rowId);
      if (target) state = BillReducer(state, changeUnitAction({ ...target, amount }));
    };

    render(<DecimalInput initial={edited.amount} product={edited} updateAmount={updateAmount} />);
    const input = screen.getByRole("textbox", { name: "Cantidad" });
    fireEvent.change(input, { target: { value: "2,75" } });
    fireEvent.blur(input);

    expect(state.products.map((product) => {
      const row = product as CartProduct;
      return { id: row.id, cartRowId: row.cartRowId, amount: row.amount, salePrice: row.salePrice };
    })).toEqual([
      { id: "catalog-product-1", cartRowId: "shortcut-row-a", amount: 2.75, salePrice: 400 },
      { id: "catalog-product-1", cartRowId: "shortcut-row-b", amount: 3.5, salePrice: 900 },
    ]);
    expect(state.total).toBe(4250);
  });
});
