import { describe, it, expect } from "vitest";
import { ProductSchema } from "@/schemas";

describe("ProductSchema validation", () => {
  const baseValidProduct = {
    id: "product-1",
    code: "P001",
    description: "Test Product",
    price: 100,
    gain: 20,
    salePrice: 120,
    client_bonus: 0,
    brand: "Brand A",
    imageName: "img.png",
    image: "https://example.com/img.png",
    last_update: new Date(),
    creation_date: new Date(),
    category: "Category A",
    subCategory: "SubCategory A",
    amount: 10,
    unit: "unidades",
  };

  it("should validate base product without details and catalog", () => {
    const result = ProductSchema.safeParse(baseValidProduct);
    expect(result.success).toBe(true);
  });

  it("should parse and retain the details property when provided", () => {
    const parsed = ProductSchema.parse({
      ...baseValidProduct,
      details: "Detailed product description",
    });
    expect(parsed.details).toBe("Detailed product description");
  });

  it("should parse and retain the details property when empty string", () => {
    const parsed = ProductSchema.parse({
      ...baseValidProduct,
      details: "",
    });
    expect(parsed.details).toBe("");
  });

  it("should parse and retain the catalog property when provided as false", () => {
    const parsed = ProductSchema.parse({
      ...baseValidProduct,
      catalog: false,
    });
    expect(parsed.catalog).toBe(false);
  });

  it("should parse and retain the catalog property when provided as true", () => {
    const parsed = ProductSchema.parse({
      ...baseValidProduct,
      catalog: true,
    });
    expect(parsed.catalog).toBe(true);
  });
});
