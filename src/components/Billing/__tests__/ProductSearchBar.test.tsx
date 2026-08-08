import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductSearchBar from "@/components/Billing/ProductSearchBar";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetProductByCode = vi.fn().mockResolvedValue(null);
const mockGetProductsByCode = vi.fn().mockResolvedValue([]);
const mockGetProductsBySearch = vi.fn().mockResolvedValue([]);
const mockGetSuppliersForFilter = vi.fn().mockResolvedValue([]);

vi.mock("@/actions/stock", () => ({
  getProductByCode: (...args: unknown[]) => mockGetProductByCode(...args),
  getProductsByCode: (...args: unknown[]) => mockGetProductsByCode(...args),
  getProductsBySearch: (...args: unknown[]) => mockGetProductsBySearch(...args),
  getSuppliersForFilter: (...args: unknown[]) => mockGetSuppliersForFilter(...args),
}));

vi.mock("@yudiel/react-qr-scanner", () => ({
  Scanner: vi.fn().mockReturnValue(null),
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

  describe("CA-14: Redundant search removed — Loading spinner", () => {
    it("should show a loading spinner while getProductsBySearch is in flight", async () => {
      // Arrange: make getProductsBySearch return a promise that NEVER resolves,
      // so the loading state stays true after the debounce fires.
      mockGetProductsBySearch.mockReturnValue(new Promise(() => {}));
      vi.useFakeTimers();

      const { container } = render(<ProductSearchBar {...defaultProps} />);
      const input = screen.getByPlaceholderText(/Buscar producto/);

      // Act: type at least 2 characters to trigger the debounced search
      fireEvent.change(input, { target: { value: "ab" } });

      // Advance timers past the OLD debounce (300ms) — the timeout fires and
      // performSearch is called, setting isSearching(true).
      vi.advanceTimersByTime(500);

      // Assert: the animated spinner should be visible
      // Currently: ProductSearchBar has no isSearching state → no spinner → fails ❌
      // After fix: isSearching=true renders an .animate-spin div → passes ✓
      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeTruthy();
    });

    it("should hide the loading spinner after search results arrive", async () => {
      // Arrange: search resolves immediately with empty results
      mockGetProductsBySearch.mockResolvedValue([]);
      vi.useFakeTimers();

      const { container } = render(<ProductSearchBar {...defaultProps} />);
      const input = screen.getByPlaceholderText(/Buscar producto/);

      // Act: type and advance past the debounce
      fireEvent.change(input, { target: { value: "ab" } });
      vi.advanceTimersByTime(500);

      // The async performSearch runs, setIsSearching(true) → renders spinner,
      // then getProductsBySearch resolves → setIsSearching(false) → spinner gone.
      // Wait for React to finish all state updates.
      await vi.waitFor(() => {
        const spinner = container.querySelector(".animate-spin");
        expect(spinner).toBeNull();
      });
    });
  });

  describe("CA-14: Redundant search removed — Debounce (300ms → 400ms)", () => {
    it("should NOT call getProductsBySearch immediately after typing", () => {
      vi.useFakeTimers();

      render(<ProductSearchBar {...defaultProps} />);
      const input = screen.getByPlaceholderText(/Buscar producto/);

      fireEvent.change(input, { target: { value: "ab" } });

      // No time has advanced — the debounce setTimeout is still pending
      expect(mockGetProductsBySearch).not.toHaveBeenCalled();
    });

    it("should NOT call getProductsBySearch at 300ms (old debounce boundary)", () => {
      vi.useFakeTimers();

      render(<ProductSearchBar {...defaultProps} />);
      const input = screen.getByPlaceholderText(/Buscar producto/);

      fireEvent.change(input, { target: { value: "ab" } });

      // Advance exactly 300ms — the OLD debounce fires here but the NEW one does not.
      // Currently: debounce is 300ms → getProductsBySearch IS called → assertion fails ❌
      // After fix: debounce is 400ms → getProductsBySearch NOT called → assertion passes ✓
      vi.advanceTimersByTime(300);

      expect(mockGetProductsBySearch).not.toHaveBeenCalled();
    });

    it("should call getProductsBySearch after the full debounce delay (400ms+)", () => {
      vi.useFakeTimers();

      render(<ProductSearchBar {...defaultProps} />);
      const input = screen.getByPlaceholderText(/Buscar producto/);

      fireEvent.change(input, { target: { value: "ab" } });

      // Advance past 400ms — both old and new debounce have fired by now
      vi.advanceTimersByTime(450);

      expect(mockGetProductsBySearch).toHaveBeenCalledWith("ab", undefined);
    });
  });
});
