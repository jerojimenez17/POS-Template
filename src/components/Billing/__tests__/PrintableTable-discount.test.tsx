import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PrintableTable from "@/components/Billing/PrintableTable";
import { BillContext } from "@/context/BillContext";
import BillState from "@/models/BillState";
import Product from "@/models/Product";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/actions/stock", () => ({
  getProductByCode: vi.fn().mockResolvedValue(null),
  getProductsBySearch: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/actions/business", () => ({
  getBusinessBillingInfoAction: vi.fn().mockResolvedValue({
    razonSocial: "Test Business",
    cuit: "20123456789",
    condicionIva: "Responsable Inscripto",
    inicioActividades: new Date("2020-01-01"),
    address: "Test Address 123",
  }),
}));

vi.mock("@yudiel/react-qr-scanner", () => ({
  Scanner: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/print", () => ({
  printElement: vi.fn().mockResolvedValue(true),
  printThermalReceipt: vi.fn().mockResolvedValue(true),
  exportToPDF: vi.fn().mockResolvedValue(true),
  buildPDFHTML: vi.fn().mockReturnValue("<div></div>"),
  PDF_STYLES: "",
}));

vi.mock("next/font/google", () => ({
  Inter: vi.fn(() => ({
    className: "inter-font",
    subsets: [],
    weight: [],
    variable: "--font-inter",
  })),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const createMockProduct = (overrides: Partial<Product> = {}): Product => {
  const product = new Product();
  product.id = overrides.id || "prod-1";
  product.code = overrides.code || "CODE001";
  product.description = overrides.description || "Test Product";
  product.salePrice = overrides.salePrice || 100;
  product.amount = overrides.amount || 1;
  product.unit = overrides.unit || "unidades";
  return product;
};

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

const createMockContext = (billStateOverrides: Partial<BillState> = {}) => ({
  BillState: createMockBillState(billStateOverrides),
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
  billStateOverrides: Partial<BillState> = {}
) => {
  const ctx = createMockContext(billStateOverrides);
  return {
    ...render(
      <BillContext.Provider value={ctx}>{ui}</BillContext.Provider>
    ),
    mockDispatch: ctx.dispatch,
    billState: ctx.BillState,
  };
};

const mockSession = {
  user: {
    businessName: "Test Business Name",
    email: "test@example.com",
    name: "Test User",
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("PrintableTable — Discount integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── DiscountControl rendered inside Totals Section ─────────────────────────

  describe("DiscountControl placement", () => {
    it("should render a DiscountControl input inside the totals section", () => {
      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      // DiscountControl should render a numeric input
      const input = screen.getByRole("spinbutton");
      expect(input).toBeTruthy();
    });

    it("should render the '%' suffix near the totals", () => {
      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      expect(screen.getByText("%")).toBeTruthy();
    });

    it("should render the 'Descuento' label near the totals", () => {
      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      expect(screen.getByLabelText(/Descuento/)).toBeTruthy();
    });
  });

  // ── Descuento row visibility ───────────────────────────────────────────────

  describe("Descuento row visibility", () => {
    it("should show Descuento row when discount > 0", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100, amount: 2 }),
      ];

      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={createMockBillState({ products, discount: 10 })}
        />
      );

      // The Descuento row should be visible
      expect(screen.getByText(/Descuento \(10%\)/)).toBeTruthy();
    });

    it("should NOT show Descuento row when discount = 0", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100, amount: 1 }),
      ];

      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={createMockBillState({ products, discount: 0 })}
        />
      );

      // Descuento row should NOT appear (only the label from DiscountControl should exist)
      const descuentoRow = screen.queryByText(/Descuento \(/);
      expect(descuentoRow).toBeNull();
    });

    it("should show correct discount percentage in Descuento row", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 200, amount: 1 }),
      ];

      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={createMockBillState({ products, discount: 25 })}
        />
      );

      expect(screen.getByText(/Descuento \(25%\)/)).toBeTruthy();
    });
  });

  // ── Discount amount calculation ────────────────────────────────────────────

  describe("Discount amount calculation", () => {
    it("should calculate and display the correct discount amount", () => {
      // subtotal = 100 * 2 = 200, discount = 10% => discountAmount = 20
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100, amount: 2 }),
      ];

      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={createMockBillState({ products, discount: 10 })}
        />
      );

      // discountAmount = Math.round(200 * 0.10) = 20
      expect(screen.getByText("-$20,00")).toBeTruthy();
    });

    it("should calculate discount correctly with fractional percentages", () => {
      // subtotal = 100 * 3 = 300, discount = 7.5% => discountAmount = Math.round(300 * 0.075) = 23
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100, amount: 3 }),
      ];

      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={createMockBillState({ products, discount: 7.5 })}
        />
      );

      expect(screen.getByText(/Descuento \(7.5%\)/)).toBeTruthy();
      expect(screen.getByText("-$23,00")).toBeTruthy();
    });
  });

  // ── Total reflects discount ───────────────────────────────────────────────

  describe("Total reflects discount", () => {
    it("should show total = subtotal when discount is 0", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100, amount: 2 }),
      ];

      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={createMockBillState({ products, discount: 0 })}
        />
      );

      // subtotal = 200, no discount => total = 200
      expect(screen.getByText("$200,00")).toBeTruthy();
    });

    it("should show correct total after discount is applied", () => {
      // subtotal = 100 * 2 = 200, discount = 10% => total = Math.round(200 * 0.9) = 180
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100, amount: 2 }),
      ];

      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={createMockBillState({ products, discount: 10 })}
        />
      );

      expect(screen.getByText("$180,00")).toBeTruthy();
    });

    it("should handle 100% discount (total = 0)", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100, amount: 1 }),
      ];

      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={createMockBillState({ products, discount: 100 })}
        />
      );

      // discountAmount = 100, total = 0
      expect(screen.getByText("-$100,00")).toBeTruthy();
      expect(screen.getByText("$0,00")).toBeTruthy();
    });
  });

  // ── Subtotal always shows gross amount ────────────────────────────────────

  describe("Subtotal is independent of discount", () => {
    it("should always show subtotal without discount applied", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100, amount: 2 }),
      ];

      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={createMockBillState({ products, discount: 30 })}
        />
      );

      // Subtotal should be 200 (not discounted)
      expect(screen.getByText("$200,00")).toBeTruthy();
    });
  });

  // ── Multiple products with discount ───────────────────────────────────────

  describe("Multiple products with discount", () => {
    it("should calculate correct totals with multiple products and discount", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100, amount: 1 }),
        createMockProduct({ id: "2", description: "Product 2", salePrice: 50, amount: 2 }),
      ];
      // subtotal = 100 + 100 = 200, discount = 20% => total = Math.round(200 * 0.8) = 160

      renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={createMockBillState({ products, discount: 20 })}
        />
      );

      expect(screen.getByText("$200,00")).toBeTruthy(); // Subtotal
      expect(screen.getByText("-$40,00")).toBeTruthy(); // Discount amount
      expect(screen.getByText("$160,00")).toBeTruthy(); // Total
    });
  });

  // ── Print:hidden on DiscountControl ───────────────────────────────────────

  describe("Print:hidden on DiscountControl", () => {
    it("should have print:hidden class on the DiscountControl wrapper", () => {
      const { container } = renderWithBillContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      // DiscountControl should be wrapped in a print:hidden element
      const printHiddenElements = container.querySelectorAll(".print\\:hidden");
      expect(printHiddenElements.length).toBeGreaterThan(0);
    });
  });
});
