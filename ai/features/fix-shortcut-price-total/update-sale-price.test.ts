// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BillReducer } from "@/context/BillReducer";
import type { BillAction } from "@/context/billActions";
import BillState from "@/models/BillState";
import Product from "@/models/Product";

function product(id: string, salePrice: number, amount: number): Product {
  return Object.assign(new Product(), { id, salePrice, amount });
}

function state(products: Product[], overrides: Partial<BillState> = {}): BillState {
  return {
    id: "bill-1",
    products,
    total: 0,
    totalWithDiscount: 0,
    seller: "",
    discount: 0,
    date: new Date("2026-01-01"),
    typeDocument: "DNI",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    twoMethods: false,
    ...overrides,
  };
}

function update(id: string, salePrice: number): BillAction {
  return { type: "updateSalePrice", payload: { id, salePrice } };
}

describe("BillReducer updateSalePrice", () => {
  it("recalculates a shortcut product with quantity one and rounds 125.50 to 126", () => {
    const shortcutProduct = product("shortcut-f1", 0, 1);
    const result = BillReducer(
      state([shortcutProduct]),
      update("shortcut-f1", 125.5),
    );

    expect(result.products[0].salePrice).toBe(125.5);
    expect(result.total).toBe(126);
    expect(result.totalWithDiscount).toBe(126);
  });

  it("recalculates the total from all products when one price changes", () => {
    const result = BillReducer(
      state([product("p1", 10, 2), product("p2", 25, 1)], {
        total: 45,
        totalWithDiscount: 45,
      }),
      update("p2", 40),
    );

    expect(result.total).toBe(60);
    expect(result.totalWithDiscount).toBe(60);
    expect(result.products.map(({ id, salePrice }) => ({ id, salePrice }))).toEqual([
      { id: "p1", salePrice: 10 },
      { id: "p2", salePrice: 40 },
    ]);
  });

  it("applies the active discount to the newly calculated raw total", () => {
    const result = BillReducer(
      state([product("p1", 50, 2), product("p2", 25, 1)], {
        total: 125,
        totalWithDiscount: 113,
        discount: 10,
      }),
      update("p2", 50),
    );

    expect(result.total).toBe(150);
    expect(result.totalWithDiscount).toBe(135);
  });

  it("does not retain the previous total when there is no discount", () => {
    const result = BillReducer(
      state([product("p1", 20, 2)], { total: 999, totalWithDiscount: 999 }),
      update("p1", 5),
    );

    expect(result.total).toBe(10);
    expect(result.totalWithDiscount).toBe(10);
  });

  it("allows an edited price of zero and recalculates the total to zero", () => {
    const result = BillReducer(
      state([product("variable-price", 75, 1)], {
        total: 75,
        totalWithDiscount: 68,
        discount: 10,
      }),
      update("variable-price", 0),
    );

    expect(result.products[0].salePrice).toBe(0);
    expect(result.total).toBe(0);
    expect(result.totalWithDiscount).toBe(0);
  });

  it("multiplies the edited price by a decimal quantity", () => {
    const result = BillReducer(
      state([product("weighted", 10, 2.5)], { total: 25, totalWithDiscount: 25 }),
      update("weighted", 12.5),
    );

    expect(result.total).toBe(31);
    expect(result.totalWithDiscount).toBe(31);
  });

  it("leaves products and derived totals unchanged for an unknown id", () => {
    const products = [product("known", 30, 2)];
    const initial = state(products, {
      total: 60,
      totalWithDiscount: 54,
      discount: 10,
    });

    const result = BillReducer(initial, update("missing", 999));

    expect(result.products).toEqual(initial.products);
    expect(result.total).toBe(60);
    expect(result.totalWithDiscount).toBe(54);
  });

  it("updates immutably without changing the original or unrelated products", () => {
    const first = product("first", 10, 1);
    const second = product("second", 20, 2);
    const initial = state([first, second], { total: 50, totalWithDiscount: 50 });

    const result = BillReducer(initial, update("first", 15));

    expect(initial.products).toEqual([first, second]);
    expect(first.salePrice).toBe(10);
    expect(result.products).not.toBe(initial.products);
    expect(result.products[0]).not.toBe(first);
    expect(result.products[1]).toBe(second);
    expect(result.total).toBe(55);
  });

  it("preserves earlier price edits when a different product is edited next", () => {
    const initial = state([product("first", 10, 1), product("second", 20, 1)], {
      total: 30,
      totalWithDiscount: 30,
    });

    const afterFirstEdit = BillReducer(initial, update("first", 15));
    const afterSecondEdit = BillReducer(afterFirstEdit, update("second", 25));

    expect(afterSecondEdit.products.map((item) => item.salePrice)).toEqual([15, 25]);
    expect(afterSecondEdit.total).toBe(40);
    expect(afterSecondEdit.totalWithDiscount).toBe(40);
  });
});
