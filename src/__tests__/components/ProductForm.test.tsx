/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProductForm from "@/components/stock/product-form";

// Mock server actions
vi.mock("@/actions/categories", () => ({
  getCategories: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/actions/brands", () => ({
  getBrands: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/actions/subcategories", () => ({
  getSubcategories: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/actions/stock", () => ({
  getSuppliers: vi.fn().mockResolvedValue([]),
  updateProduct: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("../actions/newProduct", () => ({
  newProduct: vi.fn().mockResolvedValue({ error: null }),
}));

// Mock Firebase storage
vi.mock("@/firebase/config", () => ({
  storage: {},
}));
vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn().mockResolvedValue({}),
  getDownloadURL: vi.fn().mockResolvedValue("https://example.com/image.jpg"),
  deleteObject: vi.fn().mockResolvedValue({}),
}));

// Mock CreateAttributeModal to render a simple identifiable element
vi.mock("@/components/stock/create-attribute-modal", () => ({
  default: ({ type }: { type: string }) => (
    <div data-testid={`create-attribute-${type}`}>+</div>
  ),
}));

// Mock next/dynamic for Scanner
vi.mock("next/dynamic", () => ({
  default: (fn: () => Promise<{ default: React.ComponentType }>) => {
    const Component = () => <div data-testid="mock-scanner" />;
    return Component;
  },
}));

describe("ProductForm - Select Group Layout", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Attribute select row layout", () => {
    it("should render category select and create button in a flex row", () => {
      const { container } = render(<ProductForm onClose={onClose} />);
      const row = container.querySelector(
        "[data-testid='create-attribute-category']",
      )?.parentElement;

      expect(row?.className).toContain("flex");
      expect(row?.className).toContain("gap-2");
    });
  });

  describe("Form grid layout", () => {
    it("should render with grid-cols-1 md:grid-cols-2 classes", () => {
      const { container } = render(<ProductForm onClose={onClose} />);
      const form = container.querySelector("form");
      expect(form?.className).toContain("grid-cols-1");
      expect(form?.className).toContain("md:grid-cols-2");
    });
  });

  describe("CreateAttributeModal button alignment", () => {
    it("should render all create-attribute buttons inside flex rows", () => {
      const { container } = render(<ProductForm onClose={onClose} />);
      const categoryBtn = container.querySelector(
        "[data-testid='create-attribute-category']",
      )?.parentElement;
      const subcategoryBtn = container.querySelector(
        "[data-testid='create-attribute-subcategory']",
      )?.parentElement;
      const brandBtn = container.querySelector(
        "[data-testid='create-attribute-brand']",
      )?.parentElement;
      const supplierBtn = container.querySelector(
        "[data-testid='create-attribute-supplier']",
      )?.parentElement;

      expect(categoryBtn?.className).toContain("flex");
      expect(subcategoryBtn?.className).toContain("flex");
      expect(brandBtn?.className).toContain("flex");
      expect(supplierBtn?.className).toContain("flex");
    });
  });

  describe("SelectTrigger styling consistency", () => {
    it("should render SelectElements for all 4 attribute groups", () => {
      render(<ProductForm onClose={onClose} />);

      expect(
        screen.getByRole("combobox", { name: /categoria/i }),
      ).toBeInTheDocument();
      // The subcategory select is disabled when no category is selected
      expect(
        screen.getByRole("combobox", { name: /subcategoría/i }),
      ).toBeDisabled();
      expect(
        screen.getByRole("combobox", { name: /marca/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("combobox", { name: /proveedor/i }),
      ).toBeInTheDocument();
    });
  });
});
