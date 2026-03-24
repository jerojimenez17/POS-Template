import { describe, it, expect } from "vitest";
import { PublicProduct } from "@/actions/catalog";

describe("PublicProduct Interface", () => {
  it("should accept PublicProduct with all required fields", () => {
    const product: PublicProduct = {
      id: "test-id",
      code: "TEST-001",
      description: "Test Description",
      brand: "Test Brand",
      category: "Test Category",
      salePrice: 99.99,
      unit: "units",
      image: "https://example.com/test.jpg",
      amount: 10,
    };

    expect(product.salePrice).toBe(99.99);
    expect(product.description).toBe("Test Description");
    expect(product.brand).toBe("Test Brand");
    expect(product.category).toBe("Test Category");
  });

  it("should accept PublicProduct with optional fields as null", () => {
    const product: PublicProduct = {
      id: "test-id",
      code: null,
      description: null,
      brand: null,
      category: null,
      salePrice: 50.0,
      unit: null,
      image: null,
      amount: 0,
    };

    expect(product.code).toBeNull();
    expect(product.description).toBeNull();
    expect(product.brand).toBeNull();
    expect(product.category).toBeNull();
    expect(product.image).toBeNull();
    expect(product.unit).toBeNull();
  });

  it("should have salePrice as number type", () => {
    const product: PublicProduct = {
      id: "test",
      code: null,
      description: null,
      brand: null,
      category: null,
      salePrice: 100.50,
      unit: null,
      image: null,
      amount: 10,
    };

    expect(typeof product.salePrice).toBe("number");
    expect(product.salePrice.toFixed(2)).toBe("100.50");
  });

  it("should handle zero amount", () => {
    const product: PublicProduct = {
      id: "test",
      code: "P001",
      description: "Out of Stock",
      brand: null,
      category: null,
      salePrice: 25.00,
      unit: null,
      image: null,
      amount: 0,
    };

    expect(product.amount).toBe(0);
  });
});

describe("PublicProduct - Business Logic", () => {
  it("should filter products with salePrice > 0 for catalog display", () => {
    const allProducts: PublicProduct[] = [
      { id: "1", code: null, description: "Has Price", brand: null, category: null, salePrice: 100, unit: null, image: null, amount: 10 },
      { id: "2", code: null, description: "No Price", brand: null, category: null, salePrice: 0, unit: null, image: null, amount: 10 },
      { id: "3", code: null, description: "Negative Price", brand: null, category: null, salePrice: -10, unit: null, image: null, amount: 10 },
    ];

    const catalogProducts = allProducts.filter(p => p.salePrice > 0);

    expect(catalogProducts).toHaveLength(1);
    expect(catalogProducts[0].description).toBe("Has Price");
  });

  it("should correctly map database product to PublicProduct", () => {
    const dbProduct = {
      id: "db-123",
      code: "CODE123",
      description: "Test Product",
      salePrice: 199.99,
      unit: "pcs",
      image: "https://example.com/img.png",
      amount: 50,
      brand: { name: "BrandX" },
      category: { name: "CategoryY" },
    };

    const publicProduct: PublicProduct = {
      id: dbProduct.id,
      code: dbProduct.code,
      description: dbProduct.description,
      brand: dbProduct.brand?.name ?? null,
      category: dbProduct.category?.name ?? null,
      salePrice: dbProduct.salePrice,
      unit: dbProduct.unit,
      image: dbProduct.image,
      amount: dbProduct.amount,
    };

    expect(publicProduct.brand).toBe("BrandX");
    expect(publicProduct.category).toBe("CategoryY");
    expect(publicProduct.salePrice).toBe(199.99);
  });
});

describe("ProductSelector Props Interface", () => {
  interface ProductSelectorProps {
    clientSelected?: unknown;
    session?: unknown;
    catalogo: boolean;
    order?: unknown;
    products?: PublicProduct[];
    business?: {
      name: string;
      logo: string | null;
    };
  }

  it("should accept products prop with PublicProduct array", () => {
    const props: ProductSelectorProps = {
      catalogo: true,
      products: [
        { id: "1", code: "P1", description: "Product 1", brand: "B1", category: "C1", salePrice: 100, unit: "unidades", image: null, amount: 10 },
        { id: "2", code: "P2", description: "Product 2", brand: "B2", category: "C1", salePrice: 200, unit: "kg", image: null, amount: 5 },
      ],
      business: { name: "Test Business", logo: null },
    };

    expect(props.products).toHaveLength(2);
    expect(props.business?.name).toBe("Test Business");
  });

  it("should work without optional props", () => {
    const props: ProductSelectorProps = {
      catalogo: false,
    };

    expect(props.products).toBeUndefined();
    expect(props.business).toBeUndefined();
    expect(props.clientSelected).toBeUndefined();
  });

  it("should accept business with logo URL", () => {
    const props: ProductSelectorProps = {
      catalogo: true,
      business: { name: "Logo Business", logo: "https://example.com/logo.png" },
    };

    expect(props.business?.logo).toBe("https://example.com/logo.png");
  });
});
