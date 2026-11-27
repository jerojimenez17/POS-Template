import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductSearchBar from "@/components/Billing/ProductSearchBar";
import { useCashbox } from "@/context/CashboxContext";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetProductByCode = vi.fn().mockResolvedValue(null);
const mockGetProductsByCode = vi.fn().mockResolvedValue([]);
const mockGetProductsFiltered = vi.fn().mockResolvedValue([]);
const mockGetSuppliersForFilter = vi.fn().mockResolvedValue([]);

vi.mock("@/actions/stock", () => ({
  getProductByCode: (...args: unknown[]) => mockGetProductByCode(...args),
  getProductsByCode: (...args: unknown[]) => mockGetProductsByCode(...args),
  // Merged contract (report-E D2): our action returns a plain array and
  // ProductSearchBar consumes it via results.map(...).
  getProductsFiltered: (...args: unknown[]) => mockGetProductsFiltered(...args),
  getSuppliersForFilter: (...args: unknown[]) => mockGetSuppliersForFilter(...args),
}));

vi.mock("@yudiel/react-qr-scanner", () => ({
  Scanner: vi.fn().mockReturnValue(null),
}));

// Cashbox guard (fix-searchbar union): ProductSearchBar calls useCashbox() on mount and
// throws outside CashboxProvider. Mocked following tests/components/BillButtons.shortcuts.test.tsx.
vi.mock("@/context/CashboxContext", () => ({
  useCashbox: vi.fn(() => ({
    hasActiveSession: true,
    setHasActiveSession: vi.fn(),
    isClosing: false,
    setIsClosing: vi.fn(),
    isOpeningModalOpen: false,
    setIsOpeningModalOpen: vi.fn(),
  })),
  CashboxProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const defaultProps = {
  onProductAdd: vi.fn(),
  hasSupplierFilter: false,
};

// ── Suite ──────────────────────────────────────────────────────────────────

describe("ProductSearchBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("CA-14 (merged): inline suggestions, no spinner", () => {
    it("renders no spinner element while a search is in flight (merged design)", async () => {
      // Merged component dropped upstream's isSearching spinner when our
      // getProductsFiltered array architecture won (report-E D2); feedback is the
      // suggestion list itself. Guard that no spinner artifact exists mid-flight.
      mockGetProductsFiltered.mockReturnValue(new Promise(() => {}));
      vi.useFakeTimers();

      const { container } = render(<ProductSearchBar {...defaultProps} />);
      const input = screen.getByPlaceholderText(/Buscar producto/);

      fireEvent.change(input, { target: { value: "ab" } });
      vi.advanceTimersByTime(300);

      expect(mockGetProductsFiltered).toHaveBeenCalledWith({ search: "ab", supplierId: undefined });
      expect(container.querySelector(".animate-spin")).toBeNull();
    });

    it("resolves a debounced search without leaving spinner artifacts", async () => {
      mockGetProductsFiltered.mockResolvedValue([]);
      vi.useFakeTimers();

      const { container } = render(<ProductSearchBar {...defaultProps} />);
      const input = screen.getByPlaceholderText(/Buscar producto/);

      fireEvent.change(input, { target: { value: "ab" } });
      vi.advanceTimersByTime(300);

      await vi.waitFor(() => {
        expect(mockGetProductsFiltered).toHaveBeenCalled();
        expect(container.querySelector(".animate-spin")).toBeNull();
      });
    });
  });

  describe("CA-14 (merged): debounce stays at 300ms over getProductsFiltered", () => {
    it("should NOT call getProductsFiltered immediately after typing", () => {
      vi.useFakeTimers();

      render(<ProductSearchBar {...defaultProps} />);
      const input = screen.getByPlaceholderText(/Buscar producto/);

      fireEvent.change(input, { target: { value: "ab" } });

      // No time has advanced — the debounce setTimeout is still pending
      expect(mockGetProductsFiltered).not.toHaveBeenCalled();
    });

    it("should NOT call getProductsFiltered just before the 300ms boundary", () => {
      vi.useFakeTimers();

      render(<ProductSearchBar {...defaultProps} />);
      const input = screen.getByPlaceholderText(/Buscar producto/);

      fireEvent.change(input, { target: { value: "ab" } });

      vi.advanceTimersByTime(299);

      expect(mockGetProductsFiltered).not.toHaveBeenCalled();
    });

    it("should call getProductsFiltered exactly at the 300ms debounce", () => {
      vi.useFakeTimers();

      render(<ProductSearchBar {...defaultProps} />);
      const input = screen.getByPlaceholderText(/Buscar producto/);

      fireEvent.change(input, { target: { value: "ab" } });

      vi.advanceTimersByTime(300);

      // performSearch forwards the object filter; empty supplierId normalizes to undefined.
      expect(mockGetProductsFiltered).toHaveBeenCalledWith({ search: "ab", supplierId: undefined });
    });
  });

  describe("edición de venta sin caja abierta", () => {
    it("permite agregar productos cuando allowAddWithoutSession está activo", async () => {
      vi.mocked(useCashbox).mockReturnValueOnce({
        hasActiveSession: false,
        setHasActiveSession: vi.fn(),
        isClosing: false,
        setIsClosing: vi.fn(),
        isOpeningModalOpen: false,
        setIsOpeningModalOpen: vi.fn(),
      } as never);
      mockGetProductsFiltered.mockResolvedValueOnce([
        {
          id: "product-1",
          code: "P001",
          codebar: "",
          description: "Producto sin caja",
          price: 10,
          salePrice: 10,
          gain: 0,
          amount: 5,
          unit: "unidades",
          image: "",
          imageName: "",
          client_bonus: 0,
          last_update: new Date(),
          creation_date: new Date(),
          catalog: false,
          details: "",
          brand: null,
          category: null,
          subCategory: null,
          supplier: null,
        },
      ]);

      render(<ProductSearchBar {...defaultProps} allowAddWithoutSession />);
      const input = screen.getByPlaceholderText(/Buscar producto/);

      fireEvent.change(input, { target: { value: "pro" } });

      const suggestion = await screen.findByText("Producto sin caja", {}, { timeout: 1500 });
      fireEvent.click(suggestion);

      expect(defaultProps.onProductAdd).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Producto sin caja", amount: 1 }),
      );
    });
  });
});
