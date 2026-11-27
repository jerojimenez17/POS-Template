// @vitest-environment node
/**
 * Tests for BillReducer `removeAll` action with dynamic defaultBillType.
 *
 * Currently removeAll hardcodes billType: "Factura C". After the feature,
 * removeAll should reset billType to the defaultBillType parameter (based on
 * the business's IVA condition).
 *
 * TDD: These tests will FAIL until the BillReducer is updated to accept/use
 * a defaultBillType parameter in the removeAll action.
 */
import { describe, it, expect } from "vitest";
import { BillReducer } from "@/context/BillReducer";
import BillState from "@/models/BillState";
import Product from "@/models/Product";
import BillTypes from "@/models/billType";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createProduct(overrides: Partial<Product> = {}): Product {
  return Object.assign(new Product(), overrides);
}

function createState(overrides: Partial<BillState> = {}): BillState {
  const defaults: BillState = {
    id: "",
    products: [],
    total: 0,
    totalWithDiscount: 0,
    seller: "",
    discount: 0,
    date: new Date(),
    typeDocument: "",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    twoMethods: false,
    paidMethod: "Efectivo",
    billType: BillTypes.C,
  };
  return { ...defaults, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BillReducer - removeAll with defaultBillType", () => {
  // -----------------------------------------------------------------------
  // AC-04: BillReducer resets to correct default
  // -----------------------------------------------------------------------
  it("resets billType to Factura B when defaultBillType is Factura B", () => {
    const product = createProduct({ id: "p1", salePrice: 100, amount: 2 });
    const state = createState({
      products: [product],
      total: 200,
      totalWithDiscount: 200,
      billType: BillTypes.B,
    });

    const result = BillReducer(state, {
      type: "removeAll",
      payload: null,
      defaultBillType: BillTypes.B,
    });

    expect(result.billType).toBe("Factura B");
    expect(result.products).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("resets billType to Factura C when defaultBillType is Factura C", () => {
    const product = createProduct({ id: "p1", salePrice: 100, amount: 2 });
    const state = createState({
      products: [product],
      total: 200,
      billType: BillTypes.B,
    });

    const result = BillReducer(state, {
      type: "removeAll",
      payload: null,
      defaultBillType: BillTypes.C,
    });

    expect(result.billType).toBe("Factura C");
    expect(result.products).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("resets billType to the passed defaultBillType, not the current billType", () => {
    const state = createState({
      products: [createProduct({ id: "p1", salePrice: 50, amount: 1 })],
      billType: BillTypes.A,
    });

    const result = BillReducer(state, {
      type: "removeAll",
      payload: null,
      defaultBillType: BillTypes.B,
    });

    // Should reset to Factura B (the default), not keep Factura A
    expect(result.billType).toBe("Factura B");
  });

  it("resets all fields correctly alongside billType reset", () => {
    const state = createState({
      products: [createProduct({ id: "p1", salePrice: 100, amount: 2 })],
      total: 200,
      totalWithDiscount: 180,
      discount: 10,
      documentNumber: 12345,
      billType: BillTypes.B,
    });

    const result = BillReducer(state, {
      type: "removeAll",
      payload: null,
      defaultBillType: BillTypes.B,
    });

    expect(result.products).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalWithDiscount).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.documentNumber).toBe(0);
    expect(result.billType).toBe("Factura B");
  });

  // -----------------------------------------------------------------------
  // AC-08: Default applied on form reset after sale
  // -----------------------------------------------------------------------
  it("returns Factura B as default after a Responsable Inscripto sale is cleared", () => {
    // Simulate: business is RESPONSABLE_INSCRIPTO, user completes a sale,
    // then removeAll is dispatched to reset for the next sale
    const state = createState({
      products: [
        createProduct({ id: "p1", salePrice: 500, amount: 1 }),
        createProduct({ id: "p2", salePrice: 250, amount: 2 }),
      ],
      total: 1000,
      totalWithDiscount: 900,
      discount: 10,
      billType: BillTypes.B,
    });

    const result = BillReducer(state, {
      type: "removeAll",
      payload: null,
      defaultBillType: BillTypes.B,
    });

    // After reset, the billType should be the default for RI (Factura B)
    expect(result.billType).toBe("Factura B");
    expect(result.products).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("returns Factura C as default after a Monotributo sale is cleared", () => {
    const state = createState({
      products: [createProduct({ id: "p1", salePrice: 100, amount: 1 })],
      total: 100,
      billType: BillTypes.C,
    });

    const result = BillReducer(state, {
      type: "removeAll",
      payload: null,
      defaultBillType: BillTypes.C,
    });

    expect(result.billType).toBe("Factura C");
    expect(result.products).toHaveLength(0);
  });
});
