/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ProductSelectionModal from "@/components/stock/product-selection-modal";

// Mock the server actions
vi.mock("@/actions/stock", () => ({
  getProductsFiltered: vi.fn().mockResolvedValue([
    {
      id: "product-1",
      code: "P001",
      description: "Product A",
      salePrice: 100,
      price: 60,
      unit: "unidades",
      amount: 50,
      category: { id: "cat-1", name: "Category A" },
      brand: { id: "brand-1", name: "Brand A" },
      subCategory: { id: "sub-1", name: "Sub A" },
    },
    {
      id: "product-2",
      code: "P002",
      description: "Product B",
      salePrice: 200,
      price: 120,
      unit: "kg",
      amount: 30,
      category: { id: "cat-2", name: "Category B" },
      brand: { id: "brand-2", name: "Brand B" },
      subCategory: { id: "sub-2", name: "Sub B" },
    },
  ]),
  bulkUpdatePrices: vi.fn().mockResolvedValue({ success: true }),
  bulkUpdateAmounts: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock categories and brands actions
vi.mock("@/actions/categories", () => ({
  getCategories: vi.fn().mockResolvedValue([
    { id: "cat-1", name: "Category A" },
    { id: "cat-2", name: "Category B" },
  ]),
}));

vi.mock("@/actions/brands", () => ({
  getBrands: vi.fn().mockResolvedValue([
    { id: "brand-1", name: "Brand A" },
    { id: "brand-2", name: "Brand B" },
  ]),
}));

// Mock Radix UI Dialog components
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

// Mock other UI components
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, "data-testid": testId }: any) => (
    <button data-testid={testId || "button"} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({ placeholder, value, onChange, type, "data-testid": testId }: any) => (
    <input
      data-testid={testId || "input"}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      type={type}
    />
  ),
}));

vi.mock("lucide-react", () => ({
  CheckSquare: () => <div data-testid="check-square" />,
  Square: () => <div data-testid="square" />,
  Printer: () => <div data-testid="printer" />,
  Percent: () => <div data-testid="percent" />,
  Package: () => <div data-testid="package" />,
}));

describe("ProductSelectionModal Component", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global functions
    vi.stubGlobal("alert", vi.fn());
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should not render when open is false", () => {
    render(
      <ProductSelectionModal
        open={false}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("should render when open is true", async () => {
    render(
      <ProductSelectionModal
        open={true}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("dialog-title")).toHaveTextContent("Selección Múltiple");
  });

  it("should display all products fetched from server", async () => {
    render(
      <ProductSelectionModal
        open={true}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Product A")).toBeInTheDocument();
      expect(screen.getByText("Product B")).toBeInTheDocument();
    });
  });

  it("should render bulk unit update section", async () => {
    render(
      <ProductSelectionModal
        open={true}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Aplicar Unidades")).toBeInTheDocument();
    });
  });

  it("should have mode selector with three options", async () => {
    render(
      <ProductSelectionModal
        open={true}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Establecer a")).toBeInTheDocument();
      expect(screen.getByText("Agregar")).toBeInTheDocument();
      expect(screen.getByText("Restar")).toBeInTheDocument();
    });
  });

  it("should have amount input field for unit update", async () => {
    render(
      <ProductSelectionModal
        open={true}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    await waitFor(() => {
      const amountInput = screen.getByPlaceholderText("Cantidad");
      expect(amountInput).toBeInTheDocument();
      expect(amountInput).toHaveAttribute("type", "number");
    });
  });

  it("should apply bulk unit update with mode 'set'", async () => {
    const { bulkUpdateAmounts } = await import("@/actions/stock");

    render(
      <ProductSelectionModal
        open={true}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    const amountInput = await screen.findByPlaceholderText("Cantidad");
    fireEvent.change(amountInput, { target: { value: "100" } });

    const applyButton = screen.getByText("Aplicar Unidades");
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(bulkUpdateAmounts).toHaveBeenCalledWith(
        expect.any(Array),
        100,
        "set"
      );
    });
  });

  it("should apply bulk unit update with mode 'add'", async () => {
    const { bulkUpdateAmounts } = await import("@/actions/stock");

    render(
      <ProductSelectionModal
        open={true}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    // Get the mode select (third select in the document - after category and brand)
    const selects = document.querySelectorAll("select");
    const modeSelect = selects[2]; // The mode select is the third one
    expect(modeSelect).toBeInTheDocument();

    // Change to "add" mode
    fireEvent.change(modeSelect, { target: { value: "add" } });

    const amountInput = await screen.findByPlaceholderText("Cantidad");
    fireEvent.change(amountInput, { target: { value: "50" } });

    const applyButton = screen.getByText("Aplicar Unidades");
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(bulkUpdateAmounts).toHaveBeenCalledWith(
        expect.any(Array),
        50,
        "add"
      );
    });
  });

  it("should apply bulk unit update with mode 'subtract'", async () => {
    const { bulkUpdateAmounts } = await import("@/actions/stock");

    render(
      <ProductSelectionModal
        open={true}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    // Get the mode select
    const selects = document.querySelectorAll("select");
    const modeSelect = selects[2];
    expect(modeSelect).toBeInTheDocument();

    // Change to "subtract" mode
    fireEvent.change(modeSelect, { target: { value: "subtract" } });

    const amountInput = await screen.findByPlaceholderText("Cantidad");
    fireEvent.change(amountInput, { target: { value: "20" } });

    const applyButton = screen.getByText("Aplicar Unidades");
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(bulkUpdateAmounts).toHaveBeenCalledWith(
        expect.any(Array),
        20,
        "subtract"
      );
    });
  });

  it("should show confirmation dialog before applying unit update", async () => {
    // Mock confirm to return false to cancel
    vi.stubGlobal("confirm", vi.fn(() => false));

    render(
      <ProductSelectionModal
        open={true}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    const amountInput = await screen.findByPlaceholderText("Cantidad");
    fireEvent.change(amountInput, { target: { value: "100" } });

    const applyButton = screen.getByText("Aplicar Unidades");
    fireEvent.click(applyButton);

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("100 unidades a 2 productos")
    );
  });

  it("should only update selected products for unit update", async () => {
    const { bulkUpdateAmounts } = await import("@/actions/stock");

    render(
      <ProductSelectionModal
        open={true}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    // Wait for products to load
    await screen.findByText("Product A");

    // Click on the first product row to deselect it
    const rows = screen.getAllByRole("row");
    // rows[0] is header, rows[1] is Product A, rows[2] is Product B
    fireEvent.click(rows[1]);

    const amountInput = await screen.findByPlaceholderText("Cantidad");
    fireEvent.change(amountInput, { target: { value: "100" } });

    const applyButton = screen.getByText("Aplicar Unidades");
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(bulkUpdateAmounts).toHaveBeenCalledWith(
        expect.arrayContaining(["product-2"]),
        100,
        "set"
      );
      // Ensure product-1 is NOT in the selected array
      const calls = bulkUpdateAmounts.mock.calls;
      const lastCall = calls[calls.length - 1];
      const selectedIds: string[] = lastCall[0];
      expect(selectedIds).not.toContain("product-1");
    });
  });

  it("should call onRefresh after successful unit update", async () => {
    render(
      <ProductSelectionModal
        open={true}
        onOpenChange={mockOnOpenChange}
        onRefresh={mockOnRefresh}
      />
    );

    const amountInput = await screen.findByPlaceholderText("Cantidad");
    fireEvent.change(amountInput, { target: { value: "100" } });

    const applyButton = screen.getByText("Aplicar Unidades");
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(mockOnRefresh).toHaveBeenCalled();
    });
  });
});
