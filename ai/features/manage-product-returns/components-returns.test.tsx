// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

// Mock pusher-client
vi.mock("@/lib/pusher-client", () => ({
  pusherClient: { subscribe: vi.fn(() => ({ bind: vi.fn(), unbind: vi.fn(), unsubscribe: vi.fn() })) },
}));

// Mock useCashbox hook — used by ReturnManagerButton for session check
const mockSetIsOpeningModalOpen = vi.fn();
const mockUseCashbox = vi.fn();
vi.mock("@/hooks/useCashbox", () => ({
  useCashbox: () => mockUseCashbox(),
}));
vi.mock("@/context/CashboxContext", () => ({
  useCashbox: () => mockUseCashbox(),
}));

// Mock server actions — will be provided by not-yet-implemented modules
vi.mock("@/actions/sales/returns", () => ({
  searchOrdersForReturnAction: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getOrderReturnStatusAction: vi.fn().mockResolvedValue({ success: true, data: { order: { products: [], total: 0 }, prevReturns: [], availableByItem: [] } }),
  processReturnAction: vi.fn().mockResolvedValue({ success: true, returnId: "cret12345678901234567890" }),
  getSalesWithReturnsAction: vi.fn().mockResolvedValue({ entries: [], nextCursor: null }),
  getSaleReturnsForOrderAction: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

// TDD RED: components do not exist yet
import ReturnManagerButton from "@/components/Billing/ReturnManagerButton";
import ReturnManagerModal from "@/components/Billing/ReturnManagerModal";
import ReturnOrderSearch from "@/components/Billing/ReturnOrderSearch";
import ReturnItemSelector from "@/components/Billing/ReturnItemSelector";
import ReturnSummary from "@/components/Billing/ReturnSummary";
import SaleHistoryEntryRow from "@/components/Billing/SaleHistoryEntryRow";

// Helper BillContext mock
import { BillContext } from "@/context/BillContext";

const mockBillState = {
  products: [],
  total: 0,
  totalWithDiscount: 0,
  discount: 0,
  seller: "seller@test.com",
  date: new Date(),
  typeDocument: "DNI",
  documentNumber: 0,
  IVACondition: "Consumidor Final",
  paidMethod: "Efectivo",
};

describe("ReturnManagerButton — AC1, AC3, AC4", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCashbox.mockReturnValue({ hasActiveSession: true, setIsOpeningModalOpen: mockSetIsOpeningModalOpen });
  });

  it("AC1: renders button with text 'Devoluciones' and aria-label inside flex gap-3", async () => {
    // Arrange
    const session = { user: { id: "u1", businessId: "b1" } } as unknown as never;

    // Act
    render(
      <BillContext.Provider value={{ BillState: mockBillState, dispatch: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), onOrderResetRef: { current: null } } as unknown as never}>
        <div className="flex items-center gap-3">
          <ReturnManagerButton session={session} />
        </div>
      </BillContext.Provider>
    );

    // Assert — query by role with accessible name
    const button = screen.getByRole("button", { name: /gestionar devoluciones/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-label", "Gestionar devoluciones");
    // Also visible text
    expect(screen.getByText(/devoluciones/i)).toBeInTheDocument();
    // Check icon exists (lucide Undo2 aria-hidden)
    expect(button.querySelector("svg")).toBeTruthy();
  });

  it("AC3: when hasActiveSession=false click shows toast and opens SessionManager instead of modal", async () => {
    const user = userEvent.setup();
    mockUseCashbox.mockReturnValue({ hasActiveSession: false, setIsOpeningModalOpen: mockSetIsOpeningModalOpen });
    const { toast } = await import("sonner");

    render(
      <BillContext.Provider value={{ BillState: mockBillState, dispatch: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), onOrderResetRef: { current: null } } as never}>
        <ReturnManagerButton session={{ user: { businessId: "b1" } } as never} />
      </BillContext.Provider>
    );

    await user.click(screen.getByRole("button", { name: /gestionar devoluciones/i }));

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Debe abrir una sesión/i));
    expect(mockSetIsOpeningModalOpen).toHaveBeenCalledWith(true);
    // Modal should not be open
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("AC2: click with active session opens dialog with role=dialog and focus trapped, Esc closes without action", async () => {
    const user = userEvent.setup();
    mockUseCashbox.mockReturnValue({ hasActiveSession: true, setIsOpeningModalOpen: mockSetIsOpeningModalOpen });

    render(
      <BillContext.Provider value={{ BillState: mockBillState, dispatch: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), onOrderResetRef: { current: null } } as never}>
        <ReturnManagerButton session={{ user: { businessId: "b1" } } as never} />
      </BillContext.Provider>
    );

    await user.click(screen.getByRole("button", { name: /gestionar devoluciones/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Focus should be inside dialog (search input)
    const searchInput = screen.getByPlaceholderText(/buscar|search/i);
    expect(document.activeElement).toBe(searchInput);

    // Esc closes
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const { processReturnAction } = await import("@/actions/sales/returns");
    expect(processReturnAction).not.toHaveBeenCalled();
  });

  it("AC4: opening/closing modal does not dispatch BillState changes", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <BillContext.Provider value={{ BillState: mockBillState, dispatch, addItem: vi.fn(), removeItem: vi.fn(), onOrderResetRef: { current: null } } as never}>
        <ReturnManagerButton session={{ user: { businessId: "b1" } } as never} />
      </BillContext.Provider>
    );
    await user.click(screen.getByRole("button", { name: /gestionar devoluciones/i }));
    await user.keyboard("{Escape}");
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "removeAll" }));
  });

  it("should be keyboard accessible (Enter/Space) — AC30", async () => {
    const user = userEvent.setup();
    render(
      <BillContext.Provider value={{ BillState: mockBillState, dispatch: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), onOrderResetRef: { current: null } } as never}>
        <ReturnManagerButton session={{ user: { businessId: "b1" } } as never} />
      </BillContext.Provider>
    );
    const button = screen.getByRole("button", { name: /gestionar devoluciones/i });
    button.focus();
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("should handle offline — navigator.onLine === false blocks and toasts", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    const { toast } = await import("sonner");
    render(
      <BillContext.Provider value={{ BillState: mockBillState, dispatch: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), onOrderResetRef: { current: null } } as never}>
        <ReturnManagerButton session={{ user: { businessId: "b1" } } as never} />
      </BillContext.Provider>
    );
    await user.click(screen.getByRole("button", { name: /gestionar devoluciones/i }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Sin conexión/i));
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  });
});

describe("ReturnOrderSearch — AC6 debounce + pagination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should call searchOrdersForReturnAction on mount with empty query (recent sales)", async () => {
    const { searchOrdersForReturnAction } = await import("@/actions/sales/returns");
    render(<ReturnOrderSearch onSelect={vi.fn()} />);
    await waitFor(() => expect(searchOrdersForReturnAction).toHaveBeenCalledWith("", expect.any(Object)));
  });

  it("should debounce input 300ms and filter by id/client", async () => {
    const user = userEvent.setup();
    vi.useFakeTimers();
    const { searchOrdersForReturnAction } = await import("@/actions/sales/returns");
    render(<ReturnOrderSearch onSelect={vi.fn()} />);
    const input = screen.getByPlaceholderText(/buscar venta|código|cliente/i);
    await user.type(input, "abc");
    // Fast-forward debounce
    vi.advanceTimersByTime(300);
    await waitFor(() => expect(searchOrdersForReturnAction).toHaveBeenCalledWith("abc", expect.anything()));
    vi.useRealTimers();
  });

  it("should show list and selecting calls getOrderReturnStatusAction via onSelect", async () => {
    const user = userEvent.setup();
    const { searchOrdersForReturnAction } = await import("@/actions/sales/returns");
    vi.mocked(searchOrdersForReturnAction).mockResolvedValue({
      success: true,
      data: [{ id: "ckorder12345678901234567890", date: new Date(), total: 200, seller: "s", clientName: "Juan", itemCount: 2 }],
    });
    const onSelect = vi.fn();
    render(<ReturnOrderSearch onSelect={onSelect} />);
    const item = await screen.findByText(/Juan/i);
    await user.click(item);
    expect(onSelect).toHaveBeenCalledWith("ckorder12345678901234567890");
  });
});

describe("ReturnItemSelector — AC8, AC9, AC11", () => {
  const orderMock = {
    id: "ckorder12345678901234567890",
    products: [
      { id: "ckprod12345678901234567890", code: "P1", description: "Prod 1", salePrice: 100, amount: 5 },
      { id: "ckprod12345678901234567891", code: "P2", description: "Prod 2", salePrice: 200, amount: 2 },
    ],
    discount: 10,
    total: 900,
    totalWithDiscount: 810,
  };

  it("AC8: renders table with columns descripción, código, cantidad vendida, ya devuelto, disponible, cantidad a devolver, precio, refund", () => {
    const availableByItem = new Map([
      ["ckprod12345678901234567890", { available: 3, alreadyReturned: 2 }],
      ["ckprod12345678901234567891", { available: 2, alreadyReturned: 0 }],
    ]);
    render(<ReturnItemSelector order={orderMock as never} availableByItem={availableByItem as never} onChange={vi.fn()} />);
    expect(screen.getByText(/Descripción/i)).toBeInTheDocument();
    expect(screen.getByText(/Disponible/i)).toBeInTheDocument();
    expect(screen.getByText("Prod 1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // disponible
  });

  it("AC9: stepper max = disponible, cannot exceed", async () => {
    const user = userEvent.setup();
    const availableByItem = new Map([["ckprod12345678901234567890", { available: 3, alreadyReturned: 2 }]]);
    const onChange = vi.fn();
    render(<ReturnItemSelector order={orderMock as never} availableByItem={availableByItem as never} onChange={onChange} />);
    const increment = screen.getAllByRole("button", { name: /aumentar|increment|\+/i })[0];
    // Click 4 times — should cap at 3
    await user.click(increment);
    await user.click(increment);
    await user.click(increment);
    await user.click(increment);
    const input = screen.getByDisplayValue("3");
    expect(input).toBeInTheDocument();
    // Try to increment beyond — should stay 3
    await user.click(increment);
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
  });

  it("AC11: refund calculation with discount 10% — qty 2 * price 100 * 0.9 = 180", async () => {
    const user = userEvent.setup();
    const availableByItem = new Map([["ckprod12345678901234567890", { available: 5, alreadyReturned: 0 }]]);
    const onChange = vi.fn();
    render(<ReturnItemSelector order={orderMock as never} availableByItem={availableByItem as never} onChange={onChange} />);
    const increment = screen.getAllByRole("button", { name: /aumentar|increment|\+/i })[0];
    await user.click(increment);
    await user.click(increment);
    // Should call onChange with refundAmount 180
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ refundAmount: 180, quantity: 2 })]));
    expect(screen.getByText(/\$180/)).toBeInTheDocument();
  });

  it("should calculate refund without discount as qty*price (edge)", async () => {
    const user = userEvent.setup();
    const orderNoDiscount = { ...orderMock, discount: 0 };
    const availableByItem = new Map([["ckprod12345678901234567890", { available: 5, alreadyReturned: 0 }]]);
    const onChange = vi.fn();
    render(<ReturnItemSelector order={orderNoDiscount as never} availableByItem={availableByItem as never} onChange={onChange} />);
    const increment = screen.getAllByRole("button", { name: /aumentar|increment|\+/i })[0];
    await user.click(increment);
    await user.click(increment);
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ refundAmount: 200 })]));
  });

  it("should handle deleted product snapshot (no product link, still show description/code)", () => {
    const orderDeleted = {
      id: "ckorder12345678901234567890",
      products: [{ id: null, code: "DELETED", description: "Producto eliminado", salePrice: 50, amount: 1 }],
    };
    const availableByItem = new Map([[null, { available: 1, alreadyReturned: 0 }]]);
    render(<ReturnItemSelector order={orderDeleted as never} availableByItem={availableByItem as never} onChange={vi.fn()} />);
    expect(screen.getByText("Producto eliminado")).toBeInTheDocument();
  });
});

describe("ReturnSummary — AC10 validation", () => {
  it("should disable Confirmar when no items with qty>0", () => {
    render(<ReturnSummary items={[]} reason="" onReasonChange={vi.fn()} totalRefund={0} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();
  });

  it("should disable when qty > disponible", () => {
    render(
      <ReturnSummary
        items={[{ productId: "ckprod12345678901234567890", quantity: 5, refundAmount: 500 }]}
        availableMap={new Map([["ckprod12345678901234567890", 3]])}
        reason="Motivo valido"
        onReasonChange={vi.fn()}
        totalRefund={500}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();
  });

  it("should disable when reason <3 chars", () => {
    render(
      <ReturnSummary
        items={[{ productId: "ckprod12345678901234567890", quantity: 1, refundAmount: 100 }]}
        reason="ab"
        onReasonChange={vi.fn()}
        totalRefund={100}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();
  });

  it("should enable when valid and display totalRefund", async () => {
    const onConfirm = vi.fn();
    render(
      <ReturnSummary
        items={[{ productId: "ckprod12345678901234567890", quantity: 2, refundAmount: 180 }]}
        reason="Falla"
        onReasonChange={vi.fn()}
        totalRefund={180}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: /confirmar/i });
    expect(button).not.toBeDisabled();
    expect(screen.getByText(/\$180/)).toBeInTheDocument();
  });

  it("should show validation message for reason min 3", async () => {
    const user = userEvent.setup();
    const onReasonChange = vi.fn();
    render(
      <ReturnSummary
        items={[{ productId: "ckprod12345678901234567890", quantity: 1, refundAmount: 100 }]}
        reason=""
        onReasonChange={onReasonChange}
        totalRefund={100}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const textarea = screen.getByPlaceholderText(/motivo/i);
    await user.type(textarea, "ab");
    expect(screen.getByText(/mínimo 3 caracteres/i)).toBeInTheDocument();
  });
});

describe("ReturnManagerModal — AC2, AC10, AC17, AC18", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should have DialogTitle, DialogDescription, initial focus on search (AC30)", async () => {
    render(<ReturnManagerModal open={true} onOpenChange={vi.fn()} session={{ user: { businessId: "b1" } } as never} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Gestionar devoluciones/i)).toBeInTheDocument(); // DialogTitle
    const searchInput = screen.getByPlaceholderText(/buscar/i);
    expect(document.activeElement).toBe(searchInput);
  });

  it("AC17: double click on Confirmar triggers processReturnAction only once (useRef lock)", async () => {
    const user = userEvent.setup();
    const { processReturnAction } = await import("@/actions/sales/returns");
    vi.mocked(processReturnAction).mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ success: true, returnId: "r1" }), 100)));

    render(<ReturnManagerModal open={true} onOpenChange={vi.fn()} session={{ user: { businessId: "b1" } } as never} />);

    // Simulate selecting order and filling form — we expose test helpers or directly call internals?
    // For TDD, modal should expose a Confirmar button that after selecting items calls processReturnAction with lock
    // We will search for Confirmar after mocking internal state:
    // To make test deterministic, we set items via props or fire events to fill quantities
    // Simplified: fire double click synchronously
    const confirmButton = screen.getByRole("button", { name: /confirmar/i });
    // Ensure button is enabled (mock internal already valid)
    // Double click synchronously
    await user.click(confirmButton);
    await user.click(confirmButton);
    // Should have been called once
    await waitFor(() => expect(processReturnAction).toHaveBeenCalledTimes(1));
  });

  it("AC18: if processReturnAction returns error, lock is released and retry is possible", async () => {
    const user = userEvent.setup();
    const { processReturnAction } = await import("@/actions/sales/returns");
    vi.mocked(processReturnAction).mockResolvedValueOnce({ error: "Cantidad a devolver excede lo disponible" } as never);
    vi.mocked(processReturnAction).mockResolvedValueOnce({ success: true, returnId: "r2" } as never);

    render(<ReturnManagerModal open={true} onOpenChange={vi.fn()} session={{ user: { businessId: "b1" } } as never} />);
    const confirmButton = screen.getByRole("button", { name: /confirmar/i });
    await user.click(confirmButton);
    await waitFor(() => expect(screen.getByText(/excede|error/i)).toBeInTheDocument());
    // Modal still open
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Second click should call again
    await user.click(confirmButton);
    await waitFor(() => expect(processReturnAction).toHaveBeenCalledTimes(2));
  });

  it("AC19: closing without confirm does not call processReturnAction", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { processReturnAction } = await import("@/actions/sales/returns");
    render(<ReturnManagerModal open={true} onOpenChange={onOpenChange} session={{ user: { businessId: "b1" } } as never} />);
    const cancelButton = screen.getByRole("button", { name: /cancelar|cerrar/i });
    await user.click(cancelButton);
    expect(processReturnAction).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("SaleHistoryEntryRow — AC22, AC30", () => {
  it("should render SALE row normally (no red, positive total)", () => {
    const entry = {
      kind: "SALE" as const,
      id: "o1",
      date: new Date("2026-09-01T10:00:00Z"),
      total: 250,
      bill: { id: "o1", total: 250, seller: "s@test.com" } as never,
    };
    render(<SaleHistoryEntryRow entry={entry} />);
    expect(screen.getByText(/\$250/)).toBeInTheDocument();
    expect(screen.queryByText(/Devolución/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("return-row")).not.toBeInTheDocument();
    expect(screen.getByTestId("sale-row")).toBeInTheDocument();
  });

  it("should render RETURN row with red styling, -$total, badge Devolución, link to origin, aria-label (AC22, AC30)", () => {
    const entry = {
      kind: "RETURN" as const,
      id: "r1",
      date: new Date("2026-09-03T10:00:00Z"),
      total: 180,
      orderId: "ckorder12345678901234567890",
      reason: "Falla fabrica",
      saleReturn: { id: "r1", total: 180, items: [] } as never,
    };
    render(<SaleHistoryEntryRow entry={entry} />);
    const row = screen.getByTestId("return-row");
    expect(row).toBeInTheDocument();
    expect(row).toHaveClass("bg-red-50");
    expect(screen.getByText("-$180")).toBeInTheDocument();
    expect(screen.getByText("Devolución")).toBeInTheDocument();
    expect(screen.getByText(/Ref: Venta #/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /ver venta origen/i });
    expect(link).toHaveAttribute("href", "/sales/ckorder12345678901234567890");
    expect(row).toHaveAttribute("aria-label", expect.stringMatching(/Devolución -\$180 ref venta #/));
    expect(row.querySelector(".text-red-600")).toBeTruthy();
  });

  it("RETURN row should not be editable (no Edit button)", () => {
    const entry = {
      kind: "RETURN" as const,
      id: "r1",
      date: new Date(),
      total: 50,
      orderId: "o1",
      reason: "x",
      saleReturn: { id: "r1", total: 50 } as never,
    };
    render(<SaleHistoryEntryRow entry={entry} />);
    expect(screen.queryByRole("button", { name: /editar|edit/i })).not.toBeInTheDocument();
  });

  it("should show tooltip with reason and date on hover", async () => {
    const user = userEvent.setup();
    const entry = {
      kind: "RETURN" as const,
      id: "r1",
      date: new Date("2026-09-03T10:00:00Z"),
      total: 100,
      orderId: "o1",
      reason: "Producto vencido",
      saleReturn: { id: "r1", total: 100 } as never,
    };
    render(<SaleHistoryEntryRow entry={entry} />);
    const row = screen.getByTestId("return-row");
    await user.hover(row);
    expect(await screen.findByText(/Producto vencido/i)).toBeInTheDocument();
  });
});

describe("SalesTable net totals — AC21", () => {
  // This is a lightweight unit test for the net calculation used by SalesTable
  it("should display gross, returns, net using sales-aggregates (AC21)", async () => {
    // Import the component and mock dependencies
    const SalesTable = (await import("@/components/Billing/SalesTable")).default;
    const sales = [
      { id: "o1", date: new Date(), totalWithDiscount: 100, seller: "a@a.com", CAE: null, paidMethod: "Efectivo" },
      { id: "o2", date: new Date(), totalWithDiscount: 200, seller: "b@b.com", CAE: null, paidMethod: "Efectivo" },
    ] as unknown as never[];
    // Mock getSalesWithReturnsAction to return interleaved
    vi.mocked((await import("@/actions/sales/returns")).getSalesWithReturnsAction).mockResolvedValue({
      entries: [
        { kind: "SALE", id: "o1", date: new Date(), total: 100, bill: sales[0] as never },
        { kind: "SALE", id: "o2", date: new Date(), total: 200, bill: sales[1] as never },
        { kind: "RETURN", id: "r1", date: new Date(), total: 50, orderId: "o1", saleReturn: { id: "r1" } as never, reason: "x" },
      ],
      nextCursor: null,
    });

    render(<SalesTable sales={sales} nextCursor={null} session={{ user: { businessId: "b1" } } as never} />);

    await waitFor(() => {
      expect(screen.getByText(/Ventas brutas: \$300/i)).toBeInTheDocument();
      expect(screen.getByText(/Devoluciones: -\$50/i)).toBeInTheDocument();
      expect(screen.getByText(/Neto: \$250/i)).toBeInTheDocument();
      const totalElements = screen.getAllByText(/250/);
      expect(totalElements.length).toBeGreaterThan(0);
    });
  }, 15000);
});
