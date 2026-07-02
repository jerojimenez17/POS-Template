import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ClientSelectionModal from "@/components/ledger/ClientSelectionModal";

vi.mock("@/actions/clients", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/actions/unpaid-orders", () => ({
  getClientUnpaidOrder: vi.fn(),
  addItemsToOrder: vi.fn(),
}));

vi.mock("@/components/ui/feature-blocked-modal", () => ({
  FeatureBlockedModal: () => null,
}));
//disable any error for eslint
/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("@/components/ui/input", () => ({
  Input: ({ placeholder, value, onChange, "data-testid": testId }: any) => (
    <input
    data-testid={testId || "input"}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    />
  ),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, "data-testid": testId }: any) => (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// const getByText = (text: string) => {
//   const element = screen.queryByText(text);
//   if (!element) {
//     throw new Error(`Unable to find element with text: ${text}`);
//   }
//   return element;
// };

describe("R3: ClientSelectionModal - Smart client selection", () => {
  const mockItems = [
    { id: "prod-1", code: "001", description: "Product 1", salePrice: 100, amount: 2 },
    { id: "prod-2", code: "002", description: "Product 2", salePrice: 50, amount: 1 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("should render modal when open", async () => {
    const mockClients = [
      { id: "client-1", name: "Juan Perez" },
      { id: "client-2", name: "Maria Garcia" },
    ];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockClients,
    });

    render(
      <ClientSelectionModal
        open={true}
        onOpenChange={vi.fn()}
        items={mockItems}
        total={250}
        businessId="business-1"
      />
    );

    await waitFor(() => {
      expect(screen.queryByText("Crear Orden a Cuenta")).toBeTruthy();
    });
  });

  it("should fetch clients when modal opens", async () => {
    const mockClients = [{ id: "client-1", name: "Juan Perez" }];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockClients,
    });

    render(
      <ClientSelectionModal
        open={true}
        onOpenChange={vi.fn()}
        items={mockItems}
        total={250}
        businessId="business-1"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/clients");
    });
  });

  it("should filter clients based on search input", async () => {
    const mockClients = [
      { id: "client-1", name: "Juan Perez" },
      { id: "client-2", name: "Maria Garcia" },
    ];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockClients,
    });

    render(
      <ClientSelectionModal
        open={true}
        onOpenChange={vi.fn()}
        items={mockItems}
        total={250}
        businessId="business-1"
      />
    );

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText("Buscar cliente...");
      fireEvent.change(searchInput, { target: { value: "Juan" } });
    });

    await waitFor(() => {
      expect(screen.queryByText("Juan Perez")).toBeTruthy();
    });
  });

  it("should show existing unpaid order option when selecting client with unpaid order", async () => {
    const mockClients = [{ id: "client-1", name: "Juan Perez" }];
    const mockUnpaidOrder = {
      id: "order-1",
      paidStatus: "inpago",
      total: 100,
      items: [
        { id: "item-1", description: "Previous item", quantity: 1, price: 100, addedAt: "2024-01-15T10:00:00Z" },
      ],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockClients,
    });

    const { getClientUnpaidOrder } = await import("@/actions/unpaid-orders");
    (getClientUnpaidOrder as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: mockUnpaidOrder,
    });

    render(
      <ClientSelectionModal
        open={true}
        onOpenChange={vi.fn()}
        items={mockItems}
        total={250}
        businessId="business-1"
      />
    );

    await waitFor(() => {
      const clientOption = screen.getByText("Juan Perez");
      fireEvent.click(clientOption);
    });

    await waitFor(() => {
      const submitButton = screen.getByRole("button", { name: /confirmar/i });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(screen.queryByText(/orden pendiente existente/i)).toBeTruthy();
    });
  });

  it("should allow user to choose between adding to existing or creating new order", async () => {
    const mockClients = [{ id: "client-1", name: "Juan Perez" }];
    const mockUnpaidOrder = {
      id: "order-1",
      paidStatus: "inpago",
      total: 100,
      items: [],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockClients,
    });

    const { getClientUnpaidOrder } = await import("@/actions/unpaid-orders");
    (getClientUnpaidOrder as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: mockUnpaidOrder,
    });

    const onOpenChange = vi.fn();

    render(
      <ClientSelectionModal
        open={true}
        onOpenChange={onOpenChange}
        items={mockItems}
        total={250}
        businessId="business-1"
      />
    );

    await waitFor(() => {
      const clientOption = screen.getByText("Juan Perez");
      fireEvent.click(clientOption);
    });

    await waitFor(() => {
      const submitButton = screen.getByRole("button", { name: /confirmar/i });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(screen.queryByText(/agregar a orden existente/i)).toBeTruthy();
      expect(screen.queryByText(/crear nueva orden/i)).toBeTruthy();
    });
  });

  it("should create new order when no unpaid order exists", async () => {
    const mockClients = [{ id: "client-1", name: "Juan Perez" }];

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClients,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockClients,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, order: { id: "new-order" } }),
      });

    const { getClientUnpaidOrder } = await import("@/actions/unpaid-orders");
    (getClientUnpaidOrder as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: null,
    });

    render(
      <ClientSelectionModal
        open={true}
        onOpenChange={vi.fn()}
        items={mockItems}
        total={250}
        businessId="business-1"
      />
    );

    await waitFor(() => {
      const clientOption = screen.getByText("Juan Perez");
      fireEvent.click(clientOption);
    });

    await waitFor(() => {
      const submitButton = screen.getByRole("button", { name: /confirmar/i });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/unpaid-orders",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("should display total amount correctly", async () => {
    const mockClients = [{ id: "client-1", name: "Juan Perez" }];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockClients,
    });

    render(
      <ClientSelectionModal
        open={true}
        onOpenChange={vi.fn()}
        items={mockItems}
        total={250}
        businessId="business-1"
      />
    );

    await waitFor(() => {
      expect(screen.queryByText("$250")).toBeTruthy();
    });
  });
});
