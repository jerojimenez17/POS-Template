import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DiscountControl from "@/components/Billing/DiscountControl";
import { BillContext } from "@/context/BillContext";
import BillState from "@/models/BillState";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/actions/business", () => ({
  getBusinessBillingInfoAction: vi.fn().mockResolvedValue(null),
}));

const createMockBillState = (overrides: Partial<BillState> = {}): BillState => ({
  id: "",
  products: [],
  total: 0,
  totalWithDiscount: 0,
  seller: "test@example.com",
  discount: 0,
  date: new Date(),
  typeDocument: "DNI",
  documentNumber: 0,
  IVACondition: "Consumidor Final",
  twoMethods: false,
  paidMethod: "Efectivo",
  client: "Test Client",
  ...overrides,
});

const createMockContext = (overrides: Partial<BillState> = {}) => ({
  BillState: createMockBillState(overrides),
  dispatch: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
  onOrderResetRef: { current: null },
  printMode: "thermal" as const,
  setPrintMode: vi.fn(),
  qzTrayActive: true,
  setQzTrayActive: vi.fn(),
  focusPriceProductId: null,
  setFocusPriceProductId: vi.fn(),
});

const renderWithBillContext = (
  ui: React.ReactElement,
  contextOverrides: Partial<BillState> = {}
) => {
  const ctx = createMockContext(contextOverrides);
  return {
    ...render(
      <BillContext.Provider value={ctx}>{ui}</BillContext.Provider>
    ),
    mockDispatch: ctx.dispatch,
    billState: ctx.BillState,
  };
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("DiscountControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  describe("Rendering", () => {
    it("should render an input element", () => {
      renderWithBillContext(<DiscountControl />);
      const input = screen.getByRole("spinbutton");
      expect(input).toBeTruthy();
    });

    it("should display the current discount value from BillState", () => {
      renderWithBillContext(<DiscountControl />, { discount: 10 });
      const input = screen.getByRole("spinbutton") as HTMLInputElement;
      expect(input.value).toBe("10");
    });

    it('should display "0" when discount is 0', () => {
      renderWithBillContext(<DiscountControl />, { discount: 0 });
      const input = screen.getByRole("spinbutton") as HTMLInputElement;
      expect(input.value).toBe("0");
    });

    it('should display "%" suffix or label', () => {
      renderWithBillContext(<DiscountControl />);
      expect(screen.getByText("%")).toBeTruthy();
    });

    it('should have an associated label with text "Descuento"', () => {
      renderWithBillContext(<DiscountControl />);
      expect(screen.getByLabelText(/Descuento/)).toBeTruthy();
    });

    it("should have aria-label='Porcentaje de descuento'", () => {
      renderWithBillContext(<DiscountControl />);
      const input = screen.getByRole("spinbutton");
      expect(input.getAttribute("aria-label")).toBe("Porcentaje de descuento");
    });

    it('should have inputMode="numeric"', () => {
      renderWithBillContext(<DiscountControl />);
      const input = screen.getByRole("spinbutton");
      expect(input.getAttribute("inputmode")).toBe("numeric");
    });

    it('should have autoComplete="off"', () => {
      renderWithBillContext(<DiscountControl />);
      const input = screen.getByRole("spinbutton");
      expect(input.getAttribute("autocomplete")).toBe("off");
    });
  });

  // ── Committing changes ────────────────────────────────────────────────────

  describe("Committing changes via dispatch", () => {
    it("should dispatch a discount action on Enter key press", () => {
      const { mockDispatch } = renderWithBillContext(<DiscountControl />);
      const input = screen.getByRole("spinbutton") as HTMLInputElement;

      fireEvent.change(input, { target: { value: "15" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: "discount",
        payload: 15,
      });
    });

    it("should dispatch a discount action on blur", () => {
      const { mockDispatch } = renderWithBillContext(<DiscountControl />);
      const input = screen.getByRole("spinbutton") as HTMLInputElement;

      fireEvent.change(input, { target: { value: "20" } });
      fireEvent.blur(input);

      expect(mockDispatch).toHaveBeenCalledWith({
        type: "discount",
        payload: 20,
      });
    });

    it("should commit 0 when input is empty", () => {
      const { mockDispatch } = renderWithBillContext(<DiscountControl />);
      const input = screen.getByRole("spinbutton") as HTMLInputElement;

      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);

      expect(mockDispatch).toHaveBeenCalledWith({
        type: "discount",
        payload: 0,
      });
    });
  });

  // ── Edge cases / clamping ─────────────────────────────────────────────────

  describe("Clamping", () => {
    it("should clamp negative values to 0", () => {
      const { mockDispatch } = renderWithBillContext(<DiscountControl />);
      const input = screen.getByRole("spinbutton") as HTMLInputElement;

      fireEvent.change(input, { target: { value: "-5" } });
      fireEvent.blur(input);

      expect(mockDispatch).toHaveBeenCalledWith({
        type: "discount",
        payload: 0,
      });
    });

    it("should clamp values greater than 100 to 100", () => {
      const { mockDispatch } = renderWithBillContext(<DiscountControl />);
      const input = screen.getByRole("spinbutton") as HTMLInputElement;

      fireEvent.change(input, { target: { value: "150" } });
      fireEvent.blur(input);

      expect(mockDispatch).toHaveBeenCalledWith({
        type: "discount",
        payload: 100,
      });
    });

    it("should accept fractional values like 9.5", () => {
      const { mockDispatch } = renderWithBillContext(<DiscountControl />);
      const input = screen.getByRole("spinbutton") as HTMLInputElement;

      fireEvent.change(input, { target: { value: "9.5" } });
      fireEvent.blur(input);

      expect(mockDispatch).toHaveBeenCalledWith({
        type: "discount",
        payload: 9.5,
      });
    });

    it("should treat non-numeric strings as 0", () => {
      const { mockDispatch } = renderWithBillContext(<DiscountControl />);
      const input = screen.getByRole("spinbutton") as HTMLInputElement;

      fireEvent.change(input, { target: { value: "abc" } });
      fireEvent.blur(input);

      // parseInt("abc") is NaN, so it should clamp to 0
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "discount",
        payload: 0,
      });
    });
  });

  // ── Read-only / editable=false ────────────────────────────────────────────

  describe("Read-only mode (editable=false)", () => {
    it("should render a disabled or readOnly input when editable is false", () => {
      renderWithBillContext(<DiscountControl editable={false} />, { discount: 10 });
      const input = screen.getByRole("spinbutton") as HTMLInputElement;
      expect(input.disabled || input.readOnly).toBe(true);
    });

    it("should NOT dispatch on Enter when editable is false", () => {
      const { mockDispatch } = renderWithBillContext(
        <DiscountControl editable={false} />,
        { discount: 10 }
      );
      const input = screen.getByRole("spinbutton") as HTMLInputElement;

      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("should NOT dispatch on blur when editable is false", () => {
      const { mockDispatch } = renderWithBillContext(
        <DiscountControl editable={false} />,
        { discount: 10 }
      );
      const input = screen.getByRole("spinbutton") as HTMLInputElement;

      fireEvent.blur(input);

      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  // ── External state sync ───────────────────────────────────────────────────

  describe("External state sync", () => {
    it("should re-render when BillState.discount changes externally", () => {
      const { rerender } = renderWithBillContext(<DiscountControl />, { discount: 5 });
      const input = screen.getByRole("spinbutton") as HTMLInputElement;
      expect(input.value).toBe("5");

      // Simulate external state change (e.g. order reset)
      const newCtx = createMockContext({ discount: 0 });
      rerender(
        <BillContext.Provider value={newCtx}>
          <DiscountControl />
        </BillContext.Provider>
      );

      const updatedInput = screen.getByRole("spinbutton") as HTMLInputElement;
      expect(updatedInput.value).toBe("0");
    });
  });
});
