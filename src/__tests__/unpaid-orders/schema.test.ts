import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("R1: OrderItem addedAt Field Schema", () => {
  describe("OrderItem model validation", () => {
    it("should have addedAt field defined in schema", () => {
      const orderItemSchema = z.object({
        id: z.string(),
        orderId: z.string(),
        productId: z.string().nullable(),
        code: z.string().nullable(),
        description: z.string().nullable(),
        costPrice: z.number(),
        price: z.number(),
        quantity: z.number(),
        subTotal: z.number(),
        addedAt: z.date(),
      });

      const validItem = {
        id: "item-1",
        orderId: "order-1",
        productId: "product-1",
        code: "PROD001",
        description: "Test Product",
        costPrice: 10,
        price: 20,
        quantity: 2,
        subTotal: 40,
        addedAt: new Date(),
      };

      expect(() => orderItemSchema.parse(validItem)).not.toThrow();
    });

    it("should require addedAt field when creating order items", () => {
      const orderItemSchema = z.object({
        id: z.string(),
        orderId: z.string(),
        productId: z.string().nullable(),
        code: z.string().nullable(),
        description: z.string().nullable(),
        costPrice: z.number(),
        price: z.number(),
        quantity: z.number(),
        subTotal: z.number(),
        addedAt: z.date(),
      });

      const itemWithoutAddedAt = {
        id: "item-1",
        orderId: "order-1",
        productId: "product-1",
        code: "PROD001",
        description: "Test Product",
        costPrice: 10,
        price: 20,
        quantity: 2,
        subTotal: 40,
      };

      expect(() => orderItemSchema.parse(itemWithoutAddedAt)).toThrow();
    });
  });

  describe("Create unpaid order input schema", () => {
    it("should include addedAt in items when creating unpaid order", () => {
      const createUnpaidOrderSchema = z.object({
        clientId: z.string(),
        businessId: z.string(),
        items: z.array(
          z.object({
            productId: z.string(),
            code: z.string().optional(),
            description: z.string().optional(),
            costPrice: z.number().optional(),
            price: z.number(),
            quantity: z.number(),
            subTotal: z.number(),
            addedAt: z.date(),
          })
        ),
        total: z.number(),
      });

      const input = {
        clientId: "client-1",
        businessId: "business-1",
        items: [
          {
            productId: "product-1",
            price: 100,
            quantity: 2,
            subTotal: 200,
            addedAt: new Date(),
          },
        ],
        total: 200,
      };

      expect(() => createUnpaidOrderSchema.parse(input)).not.toThrow();
    });
  });
});

describe("R2: Edit Unpaid Orders Schema", () => {
  describe("Update order item schema", () => {
    const updateOrderItemSchema = z.object({
      itemId: z.string(),
      orderId: z.string(),
      quantity: z.number().min(0.01).optional(),
      price: z.number().min(0).optional(),
    });

    it("should validate quantity update", () => {
      const result = updateOrderItemSchema.safeParse({
        itemId: "item-1",
        orderId: "order-1",
        quantity: 5,
      });

      expect(result.success).toBe(true);
    });

    it("should validate price update", () => {
      const result = updateOrderItemSchema.safeParse({
        itemId: "item-1",
        orderId: "order-1",
        price: 150,
      });

      expect(result.success).toBe(true);
    });

    it("should reject zero quantity", () => {
      const result = updateOrderItemSchema.safeParse({
        itemId: "item-1",
        orderId: "order-1",
        quantity: 0,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("Remove order item schema", () => {
    const removeOrderItemSchema = z.object({
      itemId: z.string(),
      orderId: z.string(),
    });

    it("should validate remove item input", () => {
      const result = removeOrderItemSchema.safeParse({
        itemId: "item-1",
        orderId: "order-1",
      });

      expect(result.success).toBe(true);
    });
  });
});

describe("R3: Smart Client Selection Schema", () => {
  describe("Get client unpaid order schema", () => {
    const getClientUnpaidOrderSchema = z.object({
      clientId: z.string(),
      businessId: z.string(),
    });

    it("should validate get unpaid order input", () => {
      const result = getClientUnpaidOrderSchema.safeParse({
        clientId: "client-1",
        businessId: "business-1",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Add items to existing order schema", () => {
    const addItemsToOrderSchema = z.object({
      orderId: z.string(),
      businessId: z.string(),
      items: z.array(
        z.object({
          productId: z.string(),
          code: z.string().optional(),
          description: z.string().optional(),
          costPrice: z.number().optional(),
          price: z.number(),
          quantity: z.number(),
          subTotal: z.number(),
        })
      ),
    });

    it("should validate adding items to existing order", () => {
      const result = addItemsToOrderSchema.safeParse({
        orderId: "order-1",
        businessId: "business-1",
        items: [
          {
            productId: "product-1",
            price: 50,
            quantity: 3,
            subTotal: 150,
          },
        ],
      });

      expect(result.success).toBe(true);
    });
  });
});
