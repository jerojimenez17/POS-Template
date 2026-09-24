import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ProductSearchBar from "@/components/Billing/ProductSearchBar";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/actions/stock", () => ({
  getProductByCode: vi.fn().mockResolvedValue(null),
  getProductsByCode: vi.fn().mockResolvedValue([]),
  getProductsBySearch: vi.fn().mockResolvedValue([]),
  getSuppliersForFilter: vi.fn().mockResolvedValue([]),
}));

vi.mock("@yudiel/react-qr-scanner", () => ({
  Scanner: () => null,
}));

const FocusableProductSearchBar = ProductSearchBar as React.ComponentType<
  React.ComponentProps<typeof ProductSearchBar> & {
    searchInputRef?: React.RefObject<HTMLInputElement | null>;
  }
>;

describe("ProductSearchBar — checkout focus ref contract", () => {
  it("delivers the existing search input through the optional ref and preserves its text on focus", () => {
    const searchInputRef = React.createRef<HTMLInputElement>();

    render(
      <FocusableProductSearchBar
        onProductAdd={vi.fn()}
        hasSupplierFilter={false}
        searchInputRef={searchInputRef}
      />,
    );

    const input = screen.getByPlaceholderText(/Buscar producto/);
    fireEvent.change(input, { target: { value: "keep this search" } });

    expect(searchInputRef.current).toBe(input);
    searchInputRef.current?.focus();

    expect(input).toHaveFocus();
    expect(input).toHaveValue("keep this search");
    expect(document.querySelectorAll("#product-search-input")).toHaveLength(1);
  });
});
