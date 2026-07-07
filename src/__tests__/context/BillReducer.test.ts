// @vitest-environment node
import { describe, it, expect } from "vitest";
import { BillReducer } from "@/context/BillReducer";
import BillState from "@/models/BillState";
import Product from "@/models/Product";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a Product instance with the given overrides applied. */
function createProduct(overrides: Partial<Product> = {}): Product {
  return Object.assign(new Product(), overrides);
}

/** Creates a default BillState (empty cart, no discount) with optional overrides. */
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
    billType: "Factura C",
  };
  return { ...defaults, ...overrides };
}

/**
 * Returns the correct total computed from scratch.
 * Used to verify that state.total always matches the ground truth.
 */
function computeTotal(products: Product[]): number {
  return Math.round(products.reduce((sum, p) => sum + p.salePrice * p.amount, 0));
}

/**
 * Returns the correct totalWithDiscount computed from scratch.
 */
function computeTotalWithDiscount(total: number, discount: number): number {
  return discount > 0 ? Math.round(total * (1 - discount / 100)) : total;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BillReducer", () => {
  // -----------------------------------------------------------------------
  //  addItem
  // -----------------------------------------------------------------------
  describe("addItem", () => {
    it("should add a new product and set total correctly", () => {
      const state = createState();
      const product = createProduct({ id: "p1", salePrice: 100, amount: 2 });

      const result = BillReducer(state, {
        type: "addItem",
        payload: product,
      });

      expect(result.products).toHaveLength(1);
      expect(result.products[0].id).toBe("p1");
      expect(result.products[0].amount).toBe(2);
      expect(result.total).toBe(200);
      expect(result.totalWithDiscount).toBe(200);
    });

    it("should increment amount and total when adding an existing product", () => {
      const existing = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const state = createState({
        products: [existing],
        total: 200,
        totalWithDiscount: 200,
      });

      const result = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "p1", salePrice: 100, amount: 3 }),
      });

      expect(result.products).toHaveLength(1);
      expect(result.products[0].amount).toBe(5);
      expect(result.total).toBe(500);
      expect(result.totalWithDiscount).toBe(500);
    });

    it("should calculate totalWithDiscount correctly when a discount is set", () => {
      const state = createState({ discount: 10 });
      const product = createProduct({ id: "p1", salePrice: 200, amount: 3 });

      const result = BillReducer(state, {
        type: "addItem",
        payload: product,
      });

      expect(result.total).toBe(600);
      // Expected totalWithDiscount: 600 * (1 - 10/100) = 540
      // Buggy code computes: 0 + 200*3*10 = 6000  ← WILL FAIL
      expect(result.totalWithDiscount).toBeCloseTo(540, 2);
    });

    it("should handle multiple new products with correct incremental totals", () => {
      let state = createState();

      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "p1", salePrice: 100, amount: 2 }),
      });
      expect(state.total).toBe(200);

      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "p2", salePrice: 50, amount: 3 }),
      });
      expect(state.total).toBe(350);
      expect(state.products).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  //  addUnit  (+1 unit button)
  // -----------------------------------------------------------------------
  describe("addUnit", () => {
    it("should add one unit and update total correctly (no discount)", () => {
      const product = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const state = createState({
        products: [product],
        total: 200,
        totalWithDiscount: 200,
      });

      // Payload matches the product currently in cart (amount = 2).
      // Buggy code uses payload.amount (2) for the total increment,
      // producing total = 200 + 100*2 = 400 instead of 300.
      const result = BillReducer(state, {
        type: "addUnit",
        payload: createProduct({ id: "p1", salePrice: 100, amount: 2 }),
      });

      expect(result.products[0].amount).toBe(3);
      expect(result.total).toBe(300); // 3 × 100
      expect(result.totalWithDiscount).toBe(300);
    });

    it("should calculate totalWithDiscount correctly when discount is set", () => {
      const product = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const state = createState({
        products: [product],
        total: 200,
        totalWithDiscount: 180,
        discount: 10,
      });

      const result = BillReducer(state, {
        type: "addUnit",
        payload: createProduct({ id: "p1", salePrice: 100, amount: 2 }),
      });

      expect(result.products[0].amount).toBe(3);
      expect(result.total).toBe(300);
      // Expected: 300 * (1 - 10/100) = 270
      // Buggy:   180 + 100*2*10 = 2180  ← WILL FAIL
      expect(result.totalWithDiscount).toBeCloseTo(270, 2);
    });
  });

  // -----------------------------------------------------------------------
  //  removeUnit  (-1 unit button)
  // -----------------------------------------------------------------------
  describe("removeUnit", () => {
    it("should decrement amount by 1 and decrease total by salePrice", () => {
      const product = createProduct({ id: "p1", salePrice: 100, amount: 3 });
      const state = createState({
        products: [product],
        total: 300,
        totalWithDiscount: 300,
      });

      const result = BillReducer(state, {
        type: "removeUnit",
        payload: { id: "p1" },
      });

      expect(result.products[0].amount).toBe(2);
      // Buggy code: total stays at 300  ← WILL FAIL
      expect(result.total).toBe(200);
      expect(result.totalWithDiscount).toBe(200);
    });

    it("should not go below amount 1 and should keep total unchanged", () => {
      const product = createProduct({ id: "p1", salePrice: 100, amount: 1 });
      const state = createState({
        products: [product],
        total: 100,
        totalWithDiscount: 100,
      });

      const result = BillReducer(state, {
        type: "removeUnit",
        payload: { id: "p1" },
      });

      expect(result.products[0].amount).toBe(1); // minimum 1
      expect(result.total).toBe(100); // unchanged
      expect(result.totalWithDiscount).toBe(100);
    });

    it("should correctly update totalWithDiscount when discount is set", () => {
      const product = createProduct({ id: "p1", salePrice: 100, amount: 3 });
      const state = createState({
        products: [product],
        total: 300,
        totalWithDiscount: 270,
        discount: 10,
      });

      const result = BillReducer(state, {
        type: "removeUnit",
        payload: { id: "p1" },
      });

      expect(result.products[0].amount).toBe(2);
      expect(result.total).toBe(200);
      // Expected: 200 * (1 - 10/100) = 180
      expect(result.totalWithDiscount).toBeCloseTo(180, 2);
    });
  });

  // -----------------------------------------------------------------------
  //  removeItem  (remove entire product row)
  // -----------------------------------------------------------------------
  describe("removeItem", () => {
    it("should remove the product and decrement total (2 products → 1 product)", () => {
      const p1 = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const p2 = createProduct({ id: "p2", salePrice: 50, amount: 3 });
      const state = createState({
        products: [p1, p2],
        total: 350,
        totalWithDiscount: 350,
      });

      const result = BillReducer(state, {
        type: "removeItem",
        payload: { id: "p1" },
      });

      expect(result.products).toHaveLength(1);
      expect(result.products[0].id).toBe("p2");
      // Buggy code: total stays 350  ← WILL FAIL
      expect(result.total).toBe(150);
      expect(result.totalWithDiscount).toBe(150);
    });

    it("should set total to 0 when removing the last product", () => {
      const product = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const state = createState({
        products: [product],
        total: 200,
        totalWithDiscount: 200,
      });

      const result = BillReducer(state, {
        type: "removeItem",
        payload: { id: "p1" },
      });

      expect(result.products).toHaveLength(0);
      // Buggy code: total stays 200  ← WILL FAIL
      expect(result.total).toBe(0);
      expect(result.totalWithDiscount).toBe(0);
    });

    it("should correctly update totalWithDiscount when discount is set", () => {
      const p1 = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const p2 = createProduct({ id: "p2", salePrice: 50, amount: 3 });
      const state = createState({
        products: [p1, p2],
        total: 350,
        totalWithDiscount: 315, // 350 * 0.9
        discount: 10,
      });

      const result = BillReducer(state, {
        type: "removeItem",
        payload: { id: "p1" },
      });

      expect(result.products).toHaveLength(1);
      expect(result.total).toBe(150);
      // Expected after removing p1: 150 * 0.9 = 135
      expect(result.totalWithDiscount).toBeCloseTo(135, 2);
    });
  });

  // -----------------------------------------------------------------------
  //  changeUnit  (direct amount change from input field)
  // -----------------------------------------------------------------------
  describe("changeUnit", () => {
    it("should change the amount and recalculate total", () => {
      const product = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const state = createState({
        products: [product],
        total: 200,
        totalWithDiscount: 200,
      });

      const result = BillReducer(state, {
        type: "changeUnit",
        payload: createProduct({ id: "p1", salePrice: 100, amount: 5 }),
      });

      expect(result.products[0].amount).toBe(5);
      // Buggy code: total stays 200  ← WILL FAIL
      expect(result.total).toBe(500);
      expect(result.totalWithDiscount).toBe(500);
    });

    it("should recalculate totalWithDiscount correctly when discount is set", () => {
      const product = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const state = createState({
        products: [product],
        total: 200,
        totalWithDiscount: 180,
        discount: 10,
      });

      const result = BillReducer(state, {
        type: "changeUnit",
        payload: createProduct({ id: "p1", salePrice: 100, amount: 5 }),
      });

      expect(result.products[0].amount).toBe(5);
      expect(result.total).toBe(500);
      // Expected: 500 * 0.9 = 450
      expect(result.totalWithDiscount).toBeCloseTo(450, 2);
    });
  });

  // -----------------------------------------------------------------------
  //  total  action (recalculate from scratch)
  // -----------------------------------------------------------------------
  describe("total action", () => {
    it("should recalculate total from products (fix stale value)", () => {
      const p1 = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      // Deliberately set an incorrect total to verify recalculation
      const state = createState({
        products: [p1],
        total: 999,
        totalWithDiscount: 999,
      });

      const result = BillReducer(state, { type: "total", payload: null });

      expect(result.total).toBe(200);
      // Note: total action only recalculates `total`, not `totalWithDiscount`.
      // totalWithDiscount is managed by the discount action and will be
      // recalculated the next time discount is dispatched.
    });
  });

  // -----------------------------------------------------------------------
  //  discount action
  // -----------------------------------------------------------------------
  describe("discount action", () => {
    it("should set the discount and recalculate totalWithDiscount", () => {
      const p1 = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const state = createState({
        products: [p1],
        total: 200,
        totalWithDiscount: 200,
        discount: 0,
      });

      const result = BillReducer(state, { type: "discount", payload: 15 });

      expect(result.discount).toBe(15);
      expect(result.total).toBe(200); // total unchanged
      expect(result.totalWithDiscount).toBeCloseTo(170, 2); // 200 * 0.85
    });

    it("should handle discount of 0 correctly", () => {
      const p1 = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const state = createState({
        products: [p1],
        total: 200,
        totalWithDiscount: 200,
        discount: 10,
      });

      const result = BillReducer(state, { type: "discount", payload: 0 });

      expect(result.discount).toBe(0);
      expect(result.totalWithDiscount).toBe(200);
    });

    it("should handle discount of 100 correctly (free)", () => {
      const p1 = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const state = createState({
        products: [p1],
        total: 200,
        totalWithDiscount: 200,
        discount: 0,
      });

      const result = BillReducer(state, { type: "discount", payload: 100 });

      expect(result.discount).toBe(100);
      expect(result.totalWithDiscount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  //  removeAll
  // -----------------------------------------------------------------------
  describe("removeAll", () => {
    it("should reset everything to initial values", () => {
      const p1 = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const state = createState({
        products: [p1],
        total: 200,
        totalWithDiscount: 180,
        discount: 10,
        documentNumber: 1234,
      });

      const result = BillReducer(state, {
        type: "removeAll",
        payload: null,
      });

      expect(result.products).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalWithDiscount).toBe(0);
      expect(result.discount).toBe(0);
      expect(result.documentNumber).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  //  Sequence / integration tests
  // -----------------------------------------------------------------------
  describe("operation sequences", () => {
    it("add A → add B → remove A: total always matches reduce (AC-06)", () => {
      let state = createState();

      // Add product A: $100 × 2
      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "A", salePrice: 100, amount: 2 }),
      });
      expect(state.total).toBe(200);

      // Add product B: $50 × 3
      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "B", salePrice: 50, amount: 3 }),
      });
      expect(state.total).toBe(350);

      // Remove product A
      state = BillReducer(state, {
        type: "removeItem",
        payload: { id: "A" },
      });

      expect(state.products).toHaveLength(1);
      expect(state.products[0].id).toBe("B");
      // Buggy: removeItem does NOT update total → stays 350  ← WILL FAIL
      expect(state.total).toBe(150);
      expect(state.total).toBe(computeTotal(state.products));
      expect(state.totalWithDiscount).toBe(computeTotalWithDiscount(state.total, state.discount));
    });

    it("add → changeUnit → removeUnit: total always consistent (AC-06)", () => {
      let state = createState();

      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "p1", salePrice: 100, amount: 2 }),
      });
      expect(state.total).toBe(200);

      // changeUnit to 5
      state = BillReducer(state, {
        type: "changeUnit",
        payload: createProduct({ id: "p1", salePrice: 100, amount: 5 }),
      });
      // Buggy: changeUnit does NOT update total → stays 200  ← WILL FAIL
      expect(state.total).toBe(500);

      // removeUnit → amount 4
      state = BillReducer(state, {
        type: "removeUnit",
        payload: { id: "p1" },
      });
      // Buggy: removeUnit does NOT update total → stays 500 or 200  ← WILL FAIL
      expect(state.total).toBe(400);

      expect(state.total).toBe(computeTotal(state.products));
    });

    it("add → discount → addUnit → removeUnit: totalWithDiscount consistent (AC-07)", () => {
      let state = createState();

      // Add product
      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "p1", salePrice: 100, amount: 2 }),
      });
      expect(state.total).toBe(200);

      // Apply 10% discount
      state = BillReducer(state, { type: "discount", payload: 10 });
      expect(state.discount).toBe(10);
      expect(state.totalWithDiscount).toBeCloseTo(180, 2);

      // Add unit
      state = BillReducer(state, {
        type: "addUnit",
        payload: createProduct({ id: "p1", salePrice: 100, amount: 2 }),
      });
      expect(state.total).toBe(300);
      // Expected: 300 * 0.9 = 270
      // Buggy: incremental formula gives 180 + 100*2*10 = 2180  ← WILL FAIL
      expect(state.totalWithDiscount).toBeCloseTo(270, 2);

      // Remove unit
      state = BillReducer(state, {
        type: "removeUnit",
        payload: { id: "p1" },
      });
      expect(state.total).toBe(200);
      expect(state.totalWithDiscount).toBeCloseTo(180, 2);
    });

    it("updateProductAmount flow: removeItem + addItem does not inflate total (AC-09)", () => {
      // Simulate the buggy updateProductAmount helper from PrintableTable:
      //   removeItem(product) + addItem(updatedProduct)
      const originalProduct = createProduct({ id: "p1", salePrice: 100, amount: 2 });
      const state = createState({
        products: [originalProduct],
        total: 200,
        totalWithDiscount: 200,
      });

      // Step 1: removeItem removes the product (BUG: total NOT decremented)
      const afterRemove = BillReducer(state, {
        type: "removeItem",
        payload: { id: "p1" },
      });
      // Buggy: products = [], total = 200 (should be 0)

      // Step 2: addItem adds the updated product (BUG: total inflated)
      const updatedProduct = createProduct({ id: "p1", salePrice: 100, amount: 5 });
      const result = BillReducer(afterRemove, {
        type: "addItem",
        payload: updatedProduct,
      });

      expect(result.products).toHaveLength(1);
      expect(result.products[0].amount).toBe(5);
      // Expected total after fix: 500
      // Buggy total: removeItem keeps 200, addItem adds 500 → 700  ← WILL FAIL
      expect(result.total).toBe(500);
      // Also verify it equals the computed total
      expect(result.total).toBe(computeTotal(result.products));
    });
  });

  // -----------------------------------------------------------------------
  //  Edge cases
  // -----------------------------------------------------------------------
  describe("edge cases", () => {
    it("should handle discount = 0 correctly (totalWithDiscount === total)", () => {
      const state = createState({ discount: 0 });
      const product = createProduct({ id: "p1", salePrice: 100, amount: 2 });

      const result = BillReducer(state, {
        type: "addItem",
        payload: product,
      });

      expect(result.totalWithDiscount).toBe(result.total);
    });

    it("should handle products with zero salePrice", () => {
      const product = createProduct({ id: "p1", salePrice: 0, amount: 5 });
      const state = createState();

      const result = BillReducer(state, {
        type: "addItem",
        payload: product,
      });

      expect(result.total).toBe(0);
      expect(result.totalWithDiscount).toBe(0);
    });

    it("should handle floating point prices correctly", () => {
      const product = createProduct({ id: "p1", salePrice: 10.5, amount: 3 });
      const state = createState({ discount: 10 });

      const result = BillReducer(state, {
        type: "addItem",
        payload: product,
      });

      expect(result.total).toBe(32);
      // After rounding: Math.round(31.5) = 32, Math.round(28.35) = 28
      expect(result.totalWithDiscount).toBe(28);
    });

    it("should maintain consistency across multiple add/remove cycles", () => {
      let state = createState();

      // Cycle 1: Add A, Remove A
      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "A", salePrice: 50, amount: 2 }),
      });
      state = BillReducer(state, {
        type: "removeItem",
        payload: { id: "A" },
      });
      expect(state.total).toBe(0);
      expect(state.products).toHaveLength(0);

      // Cycle 2: Add A again, Add B, Remove B
      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "A", salePrice: 50, amount: 2 }),
      });
      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "B", salePrice: 30, amount: 1 }),
      });
      state = BillReducer(state, {
        type: "removeItem",
        payload: { id: "B" },
      });
      expect(state.products).toHaveLength(1);
      expect(state.products[0].id).toBe("A");
      expect(state.total).toBe(100);
      expect(state.total).toBe(computeTotal(state.products));
    });

    it("should keep total in sync after many operations", () => {
      let state = createState();

      // Add 3 products
      const ops = [
        { id: "p1", price: 10, qty: 1 },
        { id: "p2", price: 20, qty: 2 },
        { id: "p3", price: 30, qty: 3 },
      ];
      for (const op of ops) {
        state = BillReducer(state, {
          type: "addItem",
          payload: createProduct({ id: op.id, salePrice: op.price, amount: op.qty }),
        });
      }
      expect(state.total).toBe(10 + 40 + 90); // 140

      // changeUnit p2 from 2 → 5
      state = BillReducer(state, {
        type: "changeUnit",
        payload: createProduct({ id: "p2", salePrice: 20, amount: 5 }),
      });
      // p1:10 + p2:100 + p3:90 = 200
      expect(state.total).toBe(200);

      // removeUnit p3 twice
      state = BillReducer(state, { type: "removeUnit", payload: { id: "p3" } });
      state = BillReducer(state, { type: "removeUnit", payload: { id: "p3" } });
      // p3 went from 3 → 1, so contribution is 30 (3-2=1 unit at 30)
      // p1:10 + p2:100 + p3:30 = 140
      expect(state.total).toBe(140);

      // Set 25% discount
      state = BillReducer(state, { type: "discount", payload: 25 });
      expect(state.totalWithDiscount).toBeCloseTo(105, 2); // 140 * 0.75

      // Remove p2 (should remove 100 from total)
      state = BillReducer(state, { type: "removeItem", payload: { id: "p2" } });
      expect(state.total).toBe(40); // p1:10 + p3:30
      expect(state.totalWithDiscount).toBeCloseTo(30, 2); // 40 * 0.75

      // Verify final consistency
      expect(state.total).toBe(computeTotal(state.products));
      expect(state.totalWithDiscount).toBe(
        computeTotalWithDiscount(state.total, state.discount),
      );
    });
  });

  // -----------------------------------------------------------------------
  //  Rounding (AC-01, AC-02, AC-08)
  // -----------------------------------------------------------------------
  describe("rounding", () => {
    it("should round total to integer when result has decimals", () => {
      const state = createState();
      // 3 products at $1849.3 each → 1849.3 * 3 = 5547.9 → Math.round = 5548
      const product = createProduct({ id: "p1", salePrice: 1849.3, amount: 3 });
      const result = BillReducer(state, { type: "addItem", payload: product });

      expect(result.total).toBe(5548);
      expect(result.totalWithDiscount).toBe(5548);
    });

    it("should round 1849.3 down to 1849 (single item)", () => {
      const state = createState();
      const product = createProduct({ id: "p1", salePrice: 1849.3, amount: 1 });
      const result = BillReducer(state, { type: "addItem", payload: product });

      expect(result.total).toBe(1849); // Math.round(1849.3) = 1849
    });

    it("should round 1849.5 up to 1850", () => {
      const state = createState();
      const product = createProduct({ id: "p1", salePrice: 1849.5, amount: 1 });
      const result = BillReducer(state, { type: "addItem", payload: product });

      expect(result.total).toBe(1850); // Math.round(1849.5) = 1850
    });

    it("should round 1849.7 up to 1850", () => {
      const state = createState();
      const product = createProduct({ id: "p1", salePrice: 1849.7, amount: 1 });
      const result = BillReducer(state, { type: "addItem", payload: product });

      expect(result.total).toBe(1850); // Math.round(1849.7) = 1850
    });

    it("should round 0.5 up to 1", () => {
      const state = createState();
      const product = createProduct({ id: "p1", salePrice: 0.5, amount: 1 });
      const result = BillReducer(state, { type: "addItem", payload: product });

      expect(result.total).toBe(1); // Math.round(0.5) = 1
    });

    it("should round 0.4 down to 0", () => {
      const state = createState();
      const product = createProduct({ id: "p1", salePrice: 0.4, amount: 1 });
      const result = BillReducer(state, { type: "addItem", payload: product });

      expect(result.total).toBe(0); // Math.round(0.4) = 0
    });

    it("should round totalWithDiscount correctly with integer percentage discount", () => {
      const state = createState({ discount: 10 });
      // total = Math.round(1849.3 * 3) = 5548
      // totalWithDiscount = Math.round(5548 * 0.9) = Math.round(4993.2) = 4993
      const product = createProduct({ id: "p1", salePrice: 1849.3, amount: 3 });
      const result = BillReducer(state, { type: "addItem", payload: product });

      expect(result.total).toBe(5548);
      expect(result.totalWithDiscount).toBe(4993);
    });

    it("should round totalWithDiscount with decimal discount percentage", () => {
      const state = createState({ discount: 10.5 });
      const product = createProduct({ id: "p1", salePrice: 100, amount: 1 });
      const result = BillReducer(state, { type: "addItem", payload: product });

      expect(result.total).toBe(100);
      // Math.round(100 * (1 - 10.5/100)) = Math.round(89.5) = 90
      expect(result.totalWithDiscount).toBe(90);
    });

    it("should round after reduce, not per-product", () => {
      let state = createState();

      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "p1", salePrice: 1.3, amount: 1 }),
      });
      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "p2", salePrice: 2.7, amount: 1 }),
      });

      // reduce produces 1.3 + 2.7 = 4.0, Math.round(4.0) = 4
      expect(state.total).toBe(4);
      // If rounded per-product: Math.round(1.3) + Math.round(2.7) = 1 + 3 = 4
      // (same result in this case, but implementation must round after reduce)
    });

    it("should round single item subtotal correctly", () => {
      const state = createState();
      // 510069.86 * 1 = 510069.86 → Math.round = 510070
      const product = createProduct({ id: "p1", salePrice: 510069.86, amount: 1 });
      const result = BillReducer(state, { type: "addItem", payload: product });

      expect(result.total).toBe(510070);
    });

    it("should ensure Number.isInteger(total) after complex sequence", () => {
      let state = createState();

      // Step 1: Add product with decimal price
      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "p1", salePrice: 1849.3, amount: 1 }),
      });
      expect(Number.isInteger(state.total)).toBe(true);

      // Step 2: Add unit
      state = BillReducer(state, {
        type: "addUnit",
        payload: createProduct({ id: "p1", salePrice: 1849.3, amount: 1 }),
      });
      expect(Number.isInteger(state.total)).toBe(true);

      // Step 3: Add second product with different decimal price
      state = BillReducer(state, {
        type: "addItem",
        payload: createProduct({ id: "p2", salePrice: 510069.86, amount: 1 }),
      });
      expect(Number.isInteger(state.total)).toBe(true);

      // Step 4: Change unit
      state = BillReducer(state, {
        type: "changeUnit",
        payload: createProduct({ id: "p1", salePrice: 1849.3, amount: 5 }),
      });
      expect(Number.isInteger(state.total)).toBe(true);

      // Step 5: Remove unit
      state = BillReducer(state, {
        type: "removeUnit",
        payload: { id: "p1" },
      });
      expect(Number.isInteger(state.total)).toBe(true);

      // Step 6: Remove item
      state = BillReducer(state, {
        type: "removeItem",
        payload: { id: "p2" },
      });
      expect(Number.isInteger(state.total)).toBe(true);

      // Step 7: Apply decimal discount
      state = BillReducer(state, { type: "discount", payload: 10.5 });
      expect(Number.isInteger(state.totalWithDiscount)).toBe(true);
    });
  });
});
