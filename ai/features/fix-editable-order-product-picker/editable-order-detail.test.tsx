import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditableOrderDetail from "@/components/ledger/EditableOrderDetail";

// ── Mocks ──────────────────────────────────────────────────────────────────
// The component under test currently imports `getProducts` from "@/actions/stock"
// and, after the fix, will import `getProductsBySearch` instead. Both are mocked so
// this file keeps working before AND after the fix is implemented.

const mockGetProducts = vi.fn();
const mockGetProductsBySearch = vi.fn();
const mockAddItemsToOrder = vi.fn();
const mockUpdateOrderItem = vi.fn();
const mockRemoveOrderItem = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/actions/stock", () => ({
  getProducts: (...args: unknown[]) => mockGetProducts(...args),
  getProductsBySearch: (...args: unknown[]) => mockGetProductsBySearch(...args),
}));

vi.mock("@/actions/unpaid-orders", () => ({
  addItemsToOrder: (...args: unknown[]) => mockAddItemsToOrder(...args),
  updateOrderItem: (...args: unknown[]) => mockUpdateOrderItem(...args),
  removeOrderItem: (...args: unknown[]) => mockRemoveOrderItem(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

const productPapa = {
  id: "p1",
  code: "P001",
  description: "Papa",
  salePrice: 100,
  amount: 5,
};

// NOTE: we pass ONE order item so OrderItemsTable renders its table (and therefore
// the "Agregar producto" button when isEditing) — the early-return empty state in
// OrderItemsTable would otherwise hide the add button.
const order = {
  id: "order-1",
  total: 100,
  paidStatus: "pendiente",
  clientId: "client-1",
  items: [
    {
      id: "item-1",
      productId: "p1",
      description: "Papa",
      code: "P001",
      price: 100,
      quantity: 1,
      subTotal: 100,
      addedAt: new Date("2026-08-01T12:00:00Z"),
    },
  ],
};

const businessId = "business-1";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function openAddProductDialog(user: ReturnType<typeof userEvent.setup>) {
  // "Editar items" lives in the parent component (always rendered unless paid).
  await user.click(screen.getByRole("button", { name: /editar items/i }));
  // "Agregar producto" only appears while editing (OrderItemsTable onAddItem).
  await user.click(await screen.findByRole("button", { name: /agregar producto/i }));
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("EditableOrderDetail — Agregar Producto dialog (fix-editable-order-product-picker)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetProducts.mockResolvedValue([]);
    mockGetProductsBySearch.mockResolvedValue([]);
    mockAddItemsToOrder.mockResolvedValue({ success: true });
  });

  describe("AC1 — Dialog opens immediately (no blocking await before open)", () => {
    it("opens the 'Agregar Producto' dialog instantly even when the product fetch never settles", async () => {
      // Arrange: BOTH fetches never resolve. The dialog must open regardless.
      mockGetProducts.mockReturnValue(new Promise(() => {}));
      mockGetProductsBySearch.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();

      render(<EditableOrderDetail order={order} businessId={businessId} />);

      // Act
      await openAddProductDialog(user);

      // Assert
      // RED (current code): handleOpenAddProduct does `await fetchProducts()` (which awaits
      // getProducts) BEFORE setIsAddProductOpen(true), so with a never-resolving fetch the
      // dialog never opens → getByRole throws → FAILS. After fix: dialog opens synchronously.
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Agregar Producto")).toBeInTheDocument();
    });
  });

  describe("AC2 — Bounded action used (getProductsBySearch, never getProducts)", () => {
    it("loads the initial product list through getProductsBySearch and never calls getProducts", async () => {
      const user = userEvent.setup();

      render(<EditableOrderDetail order={order} businessId={businessId} />);
      await openAddProductDialog(user);
      await screen.findByRole("dialog");

      // The initial (empty-search) list load must hit the bounded search action.
      // RED (current code): the component calls getProducts() instead, so
      // getProductsBySearch is never invoked → waitFor times out → FAILS.
      await waitFor(
        () => {
          expect(mockGetProductsBySearch).toHaveBeenCalledWith("", undefined);
        },
        { timeout: 2000 }
      );

      // The unbounded action must never be used by this component.
      expect(mockGetProducts).not.toHaveBeenCalled();
    });
  });

  describe("AC3 — Debounced server-side search (no client-side filtering)", () => {
    it("does NOT call getProductsBySearch immediately and calls it with the typed term after the debounce", async () => {
      const user = userEvent.setup();

      render(<EditableOrderDetail order={order} businessId={businessId} />);
      await openAddProductDialog(user);
      await screen.findByRole("dialog");

      // Clear the initial "" load so we only observe the typing-triggered calls.
      mockGetProductsBySearch.mockClear();

      const searchInput = screen.getByPlaceholderText("Buscar producto...");
      await user.type(searchInput, "papa");

      // Before the ~400ms debounce elapses there must be NO server call.
      expect(mockGetProductsBySearch).not.toHaveBeenCalled();

      // Once the debounce fires, the server-side search runs with the typed term.
      // RED (current code): there is no debounce/server call — typing only runs the
      // client-side filter over the already-loaded array → waitFor times out → FAILS.
      await waitFor(
        () => {
          expect(mockGetProductsBySearch).toHaveBeenCalledWith("papa", undefined);
        },
        { timeout: 3000 }
      );
    });
  });

  describe("AC4 — Loading indicator while products are being fetched", () => {
    it("shows a spinner inside the dialog while the product fetch is in flight", async () => {
      // Arrange: current-code path resolves so the dialog opens; the bounded fetch
      // never settles so isLoadingProducts stays true.
      mockGetProducts.mockResolvedValue([]);
      mockGetProductsBySearch.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();

      render(<EditableOrderDetail order={order} businessId={businessId} />);
      await openAddProductDialog(user);
      await screen.findByRole("dialog");

      // RED (current code): there is no isLoadingProducts state, so no spinner is
      // rendered → querySelector returns null → FAILS. After fix: Loader2 .animate-spin
      // is rendered inside the list area while the fetch is pending.
      const spinner = document.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("AC5 — Dialog never exceeds the viewport", () => {
    it("applies max-h-[85vh] and overflow-y-auto to the DialogContent", async () => {
      const user = userEvent.setup();

      render(<EditableOrderDetail order={order} businessId={businessId} />);
      await openAddProductDialog(user);

      const dialog = await screen.findByRole("dialog");

      // RED (current code): DialogContent className is only "max-w-md" — neither class
      // is present → toHaveClass FAILS. After fix: R5 adds both classes.
      expect(dialog).toHaveClass("max-h-[85vh]");
      expect(dialog).toHaveClass("overflow-y-auto");
    });
  });

  describe("AC6 — 'Agregar' add-flow regression (unchanged behavior)", () => {
    it("calls addItemsToOrder with the correct payload and shows the success toast", async () => {
      // Arrange: bounded fetch resolves with one product; add resolves with success.
      mockGetProducts.mockResolvedValue([productPapa]);
      mockGetProductsBySearch.mockResolvedValue([productPapa]);
      const user = userEvent.setup();

      render(<EditableOrderDetail order={order} businessId={businessId} />);
      await openAddProductDialog(user);
      const dialog = await screen.findByRole("dialog");

      // Select the product
      await user.click(await within(dialog).findByText("Papa"));

      // Set quantity to 3. Note: we use fireEvent.change (not clear+type) because the
      // controlled onChange resets an empty value to 1, which would make clear+type
      // append "3" to "1" → "13".
      const qtyInput = within(dialog).getByRole("spinbutton");
      fireEvent.change(qtyInput, { target: { value: "3" } });

      // Click "Agregar"
      await user.click(within(dialog).getByRole("button", { name: /^agregar$/i }));

      // The add payload shape must be preserved (R6 / AC6).
      await waitFor(() => {
        expect(mockAddItemsToOrder).toHaveBeenCalledWith({
          orderId: order.id,
          businessId,
          items: [
            {
              productId: "p1",
              code: "P001",
              description: "Papa",
              price: 100,
              quantity: 3,
              subTotal: 300,
            },
          ],
        });
      });
      expect(mockToastSuccess).toHaveBeenCalledWith("Producto agregado");
    });
  });

  describe("Edge cases", () => {
    it("EC1/EC4/EC9: shows 'No se encontraron productos' when the fetch returns zero products", async () => {
      // getProductsBySearch resolves [] (empty catalog / no session businessId / no matches)
      const user = userEvent.setup();

      render(<EditableOrderDetail order={order} businessId={businessId} />);
      await openAddProductDialog(user);
      const dialog = await screen.findByRole("dialog");

      expect(await within(dialog).findByText("No se encontraron productos")).toBeInTheDocument();
      // No spinner stuck on after the fetch settled.
      expect(document.querySelector(".animate-spin")).toBeNull();
    });

    it("EC5: shows 'Error al cargar productos' toast when the product fetch fails", async () => {
      mockGetProducts.mockRejectedValue(new Error("boom"));
      mockGetProductsBySearch.mockRejectedValue(new Error("boom"));
      const user = userEvent.setup();

      render(<EditableOrderDetail order={order} businessId={businessId} />);
      await openAddProductDialog(user);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith("Error al cargar productos");
      });
    });
  });
});
