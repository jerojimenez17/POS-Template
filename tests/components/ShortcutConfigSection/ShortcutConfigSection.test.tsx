import React from "react";
import { screen, render, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ShortcutConfigSection from "@/components/AdminSettings/ShortcutConfigSection";
import * as shortcutsActions from "@/actions/shortcuts";

// ── Mocks ──────────────────────────────────────────────

vi.mock("@/actions/shortcuts", () => ({
  getShortcutConfigsAction: vi.fn(),
  saveShortcutConfigAction: vi.fn(),
  deleteShortcutConfigAction: vi.fn(),
}));

vi.mock("@/actions/stock", () => ({
  getProductsBySearch: vi.fn().mockResolvedValue([]),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock next/navigation (required by child components or providers)
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// ── Fixtures ────────────────────────────────────────────

const businessId = "business-123";

const validConfigs = [
  {
    id: "cfg-1",
    key: "F1" as const,
    productId: "prod-1",
    product: {
      id: "prod-1",
      description: "Producto Precio Variable",
      code: "VAR001",
      salePrice: 0,
    },
  },
  {
    id: "cfg-2",
    key: "F2" as const,
    productId: "prod-2",
    product: {
      id: "prod-2",
      description: "Producto Fijo",
      code: "FIJ002",
      salePrice: 150.5,
    },
  },
];

const configsWithDeletedProduct = [
  {
    id: "cfg-1",
    key: "F1" as const,
    productId: "prod-1",
    product: {
      id: "prod-1",
      description: "Producto Precio Variable",
      code: "VAR001",
      salePrice: 0,
    },
  },
  {
    id: "cfg-2",
    key: "F2" as const,
    productId: "deleted-prod",
    product: null, // The related Product was deleted (FK orphan)
  },
];

// ── Tests ───────────────────────────────────────────────

describe("ShortcutConfigSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── AC9: Loading state ─────────────────────────────

  it("should show loading state initially (AC9)", async () => {
    // Return a promise that never resolves so loading stays true
    vi.mocked(shortcutsActions.getShortcutConfigsAction).mockReturnValue(
      new Promise<never>(() => {})
    );

    render(<ShortcutConfigSection businessId={businessId} />);

    // The heading and loading text should be visible immediately
    expect(screen.getByText("Atajos de teclado")).toBeInTheDocument();
    expect(screen.getByText("Cargando...")).toBeInTheDocument();
  });

  // ─── AC6/AC7/T13: Valid configs populate inputs ──────

  it("should populate searchTerms and selectedProducts from valid configs (AC6/AC7)", async () => {
    vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
      success: true,
      data: validConfigs,
    });

    render(<ShortcutConfigSection businessId={businessId} />);

    // Wait for fetch to complete
    await waitFor(() => {
      expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalledWith(
        businessId
      );
    });

    // F1 input should show "code - description"
    await waitFor(() => {
      expect(
        screen.getByDisplayValue("VAR001 - Producto Precio Variable")
      ).toBeInTheDocument();
    });

    // F2 input should show "code - description"
    await waitFor(() => {
      expect(
        screen.getByDisplayValue("FIJ002 - Producto Fijo")
      ).toBeInTheDocument();
    });

    // Each key label should appear
    expect(screen.getByText("F1")).toBeInTheDocument();
    expect(screen.getByText("F2")).toBeInTheDocument();
    expect(screen.getByText("F3")).toBeInTheDocument();

    // Selected product info should be shown (description — $price)
    expect(screen.getByText(/Producto Precio Variable/)).toBeInTheDocument();
    expect(screen.getByText(/Producto Fijo/)).toBeInTheDocument();
  });

  // ─── T14: Null product shows fallback text ────────────

  it("should show '[Producto eliminado]' fallback text when a config's product is null (Bug B / T14)", async () => {
    vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
      success: true,
      data: configsWithDeletedProduct,
    });

    render(<ShortcutConfigSection businessId={businessId} />);

    await waitFor(() => {
      expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalledWith(
        businessId
      );
    });

    // F1 should still show the valid product info (unchanged)
    await waitFor(() => {
      expect(
        screen.getByDisplayValue("VAR001 - Producto Precio Variable")
      ).toBeInTheDocument();
    });

    // F2 input should show "[Producto eliminado]" instead of being empty
    // This requires the fix in ShortcutConfigSection.fetchConfigs to handle
    // config.product === null (currently the input stays empty → this assertion FAILS)
    await waitFor(() => {
      expect(
        screen.getByDisplayValue("[Producto eliminado]")
      ).toBeInTheDocument();
    });
  });

  // ─── AC11/T15: Error state ──────────────────────────

  it("should display error message when getShortcutConfigsAction returns an error (AC11/T15)", async () => {
    vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
      success: false,
      error: "Error al cargar configuraciones",
    });

    render(<ShortcutConfigSection businessId={businessId} />);

    await waitFor(() => {
      expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalledWith(
        businessId
      );
    });

    // The component should render an error state with the error message.
    // Currently the component has no error handling — it just renders the
    // normal UI with empty inputs. This test FAILS until the fix adds a
    // fetchError state and error UI branch.
    await waitFor(() => {
      expect(
        screen.getByText("Error al cargar configuraciones")
      ).toBeInTheDocument();
    });
  });

  // ─── T16: Empty configs ─────────────────────────────

  it("should show empty inputs when getShortcutConfigsAction returns empty array (T16)", async () => {
    vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<ShortcutConfigSection businessId={businessId} />);

    await waitFor(() => {
      expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalledWith(
        businessId
      );
    });

    // All inputs should be empty (placeholder="Buscar producto por código o nombre...")
    const inputs = screen.getAllByPlaceholderText(
      "Buscar producto por código o nombre..."
    );
    expect(inputs).toHaveLength(3);
    inputs.forEach((input) => {
      expect(input).toHaveValue("");
    });
  });
});
