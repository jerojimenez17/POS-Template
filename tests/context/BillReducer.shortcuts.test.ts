import { describe, it, expect } from "vitest";
import { BillReducer } from "@/context/BillReducer";
import BillState from "@/models/BillState";
import { BillAction } from "@/context/billActions";

describe("BillReducer - updateSalePrice action", () => {
  const baseState: BillState = {
    id: "bill-1",
    products: [
      {
        id: "prod-1",
        code: "P001",
        codebar: "",
        description: "Producto Uno",
        brand: "",
        subCategory: "",
        price: 100,
        salePrice: 100,
        gain: 0,
        suplier: { id: "s1", name: "Test", discount: 0, iva: 0, gain: 0 },
        client_bonus: 0,
        unit: "unidades",
        image: "",
        imageName: "",
        images: [],
        amount: 2,
        last_update: new Date(),
        creation_date: new Date(),
        category: "",
        catalog: true,
        details: "",
      },
      {
        id: "prod-2",
        code: "P002",
        codebar: "",
        description: "Producto Dos",
        brand: "",
        subCategory: "",
        price: 200,
        salePrice: 200,
        gain: 0,
        suplier: { id: "s1", name: "Test", discount: 0, iva: 0, gain: 0 },
        client_bonus: 0,
        unit: "unidades",
        image: "",
        imageName: "",
        images: [],
        amount: 1,
        last_update: new Date(),
        creation_date: new Date(),
        category: "",
        catalog: true,
        details: "",
      },
    ],
    total: 400,
    totalWithDiscount: 400,
    seller: "",
    discount: 0,
    date: new Date(),
    typeDocument: "DNI",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    twoMethods: false,
  };

  it("should update salePrice of the matching product", () => {
    const action: BillAction = {
      type: "updateSalePrice",
      payload: { id: "prod-1", salePrice: 50 },
    };

    const newState = BillReducer(baseState, action);

    const updatedProduct = newState.products.find((p) => p.id === "prod-1");
    expect(updatedProduct).toBeDefined();
    expect(updatedProduct!.salePrice).toBe(50);

    // Other product should be unchanged
    const otherProduct = newState.products.find((p) => p.id === "prod-2");
    expect(otherProduct).toBeDefined();
    expect(otherProduct!.salePrice).toBe(200);
  });

  it("should not affect other products when updating salePrice", () => {
    const action: BillAction = {
      type: "updateSalePrice",
      payload: { id: "prod-1", salePrice: 75 },
    };

    const newState = BillReducer(baseState, action);

    // Product 2 should remain identical
    expect(newState.products[1]).toEqual(baseState.products[1]);

    // The edited sale price is part of the bill total, including quantity.
    expect(newState.total).toBe(350);
    expect(newState.totalWithDiscount).toBe(350);
  });

  it("should return state unchanged when product id does not exist", () => {
    const action: BillAction = {
      type: "updateSalePrice",
      payload: { id: "non-existent-id", salePrice: 999 },
    };

    const newState = BillReducer(baseState, action);

    expect(newState.products).toEqual(baseState.products);
    expect(newState.total).toBe(baseState.total);
  });

  it("should handle multiple sequential updateSalePrice calls", () => {
    const firstAction: BillAction = {
      type: "updateSalePrice",
      payload: { id: "prod-1", salePrice: 10 },
    };
    const secondAction: BillAction = {
      type: "updateSalePrice",
      payload: { id: "prod-2", salePrice: 20 },
    };

    const stateAfterFirst = BillReducer(baseState, firstAction);
    const stateAfterSecond = BillReducer(stateAfterFirst, secondAction);

    expect(stateAfterSecond.products[0].salePrice).toBe(10);
    expect(stateAfterSecond.products[1].salePrice).toBe(20);
  });

  it("should update salePrice to 0 (for variable-price products)", () => {
    const action: BillAction = {
      type: "updateSalePrice",
      payload: { id: "prod-1", salePrice: 0 },
    };

    const newState = BillReducer(baseState, action);

    const updatedProduct = newState.products.find((p) => p.id === "prod-1");
    expect(updatedProduct).toBeDefined();
    expect(updatedProduct!.salePrice).toBe(0);
  });

  it("should not mutate the original state", () => {
    const action: BillAction = {
      type: "updateSalePrice",
      payload: { id: "prod-1", salePrice: 50 },
    };

    BillReducer(baseState, action);

    // Original state should be unchanged
    expect(baseState.products[0].salePrice).toBe(100);
    expect(baseState.products[1].salePrice).toBe(200);
  });

  it("should update salePrice but preserve all other product properties", () => {
    const action: BillAction = {
      type: "updateSalePrice",
      payload: { id: "prod-1", salePrice: 42 },
    };

    const newState = BillReducer(baseState, action);
    const updatedProduct = newState.products[0];

    expect(updatedProduct.salePrice).toBe(42);
    expect(updatedProduct.id).toBe("prod-1");
    expect(updatedProduct.code).toBe("P001");
    expect(updatedProduct.description).toBe("Producto Uno");
    expect(updatedProduct.amount).toBe(2);
    expect(updatedProduct.price).toBe(100);
  });
});
