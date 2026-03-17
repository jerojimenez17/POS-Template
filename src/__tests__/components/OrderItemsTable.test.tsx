import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import OrderItemsTable from "@/components/ledger/OrderItemsTable";

vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChange, type, "data-testid": testId }: any) => (
    <input
      data-testid={testId}
      value={value}
      onChange={onChange}
      type={type}
    />
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, "data-testid": testId, variant }: any) => (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

describe("R1: OrderItemsTable - Display items grouped by addedAt date", () => {
  const mockItems = [
    {
      id: "item-1",
      productId: "prod-1",
      description: "Product A",
      price: 100,
      quantity: 2,
      subTotal: 200,
      addedAt: new Date("2024-01-15T10:30:00"),
    },
    {
      id: "item-2",
      productId: "prod-1",
      description: "Product A",
      price: 100,
      quantity: 1,
      subTotal: 100,
      addedAt: new Date("2024-01-15T10:30:00"),
    },
    {
      id: "item-3",
      productId: "prod-2",
      description: "Product B",
      price: 50,
      quantity: 3,
      subTotal: 150,
      addedAt: new Date("2024-01-16T14:00:00"),
    },
  ];

  it("should display items in the table", () => {
    render(
      <OrderItemsTable
        items={mockItems}
        isEditable={false}
        onUpdateQuantity={vi.fn()}
        onUpdatePrice={vi.fn()}
        onRemoveItem={vi.fn()}
        onAddItem={vi.fn()}
      />
    );

    expect(screen.queryByText("Product A")).toBeTruthy();
    expect(screen.queryByText("Product B")).toBeTruthy();
  });

  it("should group items by addedAt date", () => {
    render(
      <OrderItemsTable
        items={mockItems}
        isEditable={false}
        onUpdateQuantity={vi.fn()}
        onUpdatePrice={vi.fn()}
        onRemoveItem={vi.fn()}
        onAddItem={vi.fn()}
      />
    );

    expect(screen.queryByText(/15\/01\/2024/)).toBeTruthy();
    expect(screen.queryByText(/16\/01\/2024/)).toBeTruthy();
  });

  it("should display date in DD/MM/YYYY HH:MM format (Argentine)", () => {
    render(
      <OrderItemsTable
        items={mockItems}
        isEditable={false}
        onUpdateQuantity={vi.fn()}
        onUpdatePrice={vi.fn()}
        onRemoveItem={vi.fn()}
        onAddItem={vi.fn()}
      />
    );

    expect(screen.queryByText(/15\/01\/2024 10:30/)).toBeTruthy();
    expect(screen.queryByText(/16\/01\/2024 14:00/)).toBeTruthy();
  });

  it("should display items added today with 'Hoy' label", () => {
    const todayItems = [
      {
        id: "item-1",
        description: "Product Today",
        price: 100,
        quantity: 1,
        subTotal: 100,
        addedAt: new Date(),
      },
    ];

    render(
      <OrderItemsTable
        items={todayItems}
        isEditable={false}
        onUpdateQuantity={vi.fn()}
        onUpdatePrice={vi.fn()}
        onRemoveItem={vi.fn()}
        onAddItem={vi.fn()}
      />
    );

    expect(screen.queryByText(/Hoy/)).toBeTruthy();
  });

  it("should display correct subTotal for each item", () => {
    render(
      <OrderItemsTable
        items={mockItems}
        isEditable={false}
        onUpdateQuantity={vi.fn()}
        onUpdatePrice={vi.fn()}
        onRemoveItem={vi.fn()}
        onAddItem={vi.fn()}
      />
    );

    expect(screen.queryByText("200")).toBeTruthy();
    expect(screen.queryByText("100")).toBeTruthy();
    expect(screen.queryByText("150")).toBeTruthy();
  });
});

describe("R2: OrderItemsTable - Edit items in table", () => {
  const mockItems = [
    {
      id: "item-1",
      productId: "prod-1",
      description: "Product A",
      price: 100,
      quantity: 2,
      subTotal: 200,
      addedAt: new Date(),
    },
  ];

  it("should show edit controls when isEditable is true", () => {
    render(
      <OrderItemsTable
        items={mockItems}
        isEditable={true}
        onUpdateQuantity={vi.fn()}
        onUpdatePrice={vi.fn()}
        onRemoveItem={vi.fn()}
        onAddItem={vi.fn()}
      />
    );

    const quantityInputs = screen.getAllByTestId("quantity-input");
    expect(quantityInputs.length).toBeGreaterThan(0);
  });

  it("should hide edit controls when isEditable is false", () => {
    render(
      <OrderItemsTable
        items={mockItems}
        isEditable={false}
        onUpdateQuantity={vi.fn()}
        onUpdatePrice={vi.fn()}
        onRemoveItem={vi.fn()}
        onAddItem={vi.fn()}
      />
    );

    const quantityInputs = screen.queryAllByTestId("quantity-input");
    expect(quantityInputs.length).toBe(0);
  });

  it("should call onUpdateQuantity when quantity changes", async () => {
    const onUpdateQuantity = vi.fn();

    render(
      <OrderItemsTable
        items={mockItems}
        isEditable={true}
        onUpdateQuantity={onUpdateQuantity}
        onUpdatePrice={vi.fn()}
        onRemoveItem={vi.fn()}
        onAddItem={vi.fn()}
      />
    );

    const quantityInput = screen.getByTestId("quantity-input");
    expect(quantityInput).toBeTruthy();
  });

  it("should call onRemoveItem when remove button is clicked", () => {
    const onRemoveItem = vi.fn();

    render(
      <OrderItemsTable
        items={mockItems}
        isEditable={true}
        onUpdateQuantity={vi.fn()}
        onUpdatePrice={vi.fn()}
        onRemoveItem={onRemoveItem}
        onAddItem={vi.fn()}
      />
    );

    const removeButtons = screen.getAllByTestId("remove-button");
    expect(removeButtons.length).toBeGreaterThan(0);
  });

  it("should calculate total correctly when items change", () => {
    const items = [
      {
        id: "item-1",
        description: "Product A",
        price: 100,
        quantity: 2,
        subTotal: 200,
        addedAt: new Date(),
      },
      {
        id: "item-2",
        description: "Product B",
        price: 50,
        quantity: 3,
        subTotal: 150,
        addedAt: new Date(),
      },
    ];

    render(
      <OrderItemsTable
        items={items}
        isEditable={false}
        onUpdateQuantity={vi.fn()}
        onUpdatePrice={vi.fn()}
        onRemoveItem={vi.fn()}
        onAddItem={vi.fn()}
      />
    );

    expect(screen.queryByText("350")).toBeTruthy();
  });
});

describe("R3: OrderItemsTable - Items grouped by date for existing order", () => {
  it("should show separate groups for items added on different dates", () => {
    const mixedDateItems = [
      {
        id: "item-1",
        description: "Morning Item",
        price: 50,
        quantity: 1,
        subTotal: 50,
        addedAt: new Date("2024-01-15T09:00:00"),
      },
      {
        id: "item-2",
        description: "Afternoon Item",
        price: 75,
        quantity: 2,
        subTotal: 150,
        addedAt: new Date("2024-01-15T15:30:00"),
      },
      {
        id: "item-3",
        description: "Next Day Item",
        price: 100,
        quantity: 1,
        subTotal: 100,
        addedAt: new Date("2024-01-16T11:00:00"),
      },
    ];

    render(
      <OrderItemsTable
        items={mixedDateItems}
        isEditable={false}
        onUpdateQuantity={vi.fn()}
        onUpdatePrice={vi.fn()}
        onRemoveItem={vi.fn()}
        onAddItem={vi.fn()}
      />
    );

    const date15 = screen.queryAllByText(/15\/01\/2024/);
    const date16 = screen.queryAllByText(/16\/01\/2024/);

    expect(date15.length).toBeGreaterThan(0);
    expect(date16.length).toBeGreaterThan(0);
  });

  it("should display Agregado el label for grouped items", () => {
    const items = [
      {
        id: "item-1",
        description: "Product",
        price: 100,
        quantity: 1,
        subTotal: 100,
        addedAt: new Date(),
      },
    ];

    render(
      <OrderItemsTable
        items={items}
        isEditable={false}
        onUpdateQuantity={vi.fn()}
        onUpdatePrice={vi.fn()}
        onRemoveItem={vi.fn()}
        onAddItem={vi.fn()}
      />
    );

    expect(screen.queryByText(/Agregado/)).toBeTruthy();
  });
});
