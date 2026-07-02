import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PrintableTable from "@/components/Billing/PrintableTable";
import { BillContext } from "@/context/BillContext";
import BillState from "@/models/BillState";
import Product from "@/models/Product";

vi.mock("@/hooks/useFeatures", () => ({
  useFeatures: vi.fn(),
}));

import { useFeatures } from "@/hooks/useFeatures";

// Production routes barcode lookups through getProductsByCode (returns array) when
// no supplierId is active. getProductByCode is only called when supplierId is set.
const mockGetProductsByCode = vi.fn().mockResolvedValue([]);
const mockGetProductsBySearch = vi.fn().mockResolvedValue([]);

vi.mock("@/actions/stock", () => ({
  getProductByCode: vi.fn().mockResolvedValue(null),
  getProductsByCode: (...args: unknown[]) => mockGetProductsByCode(...args),
  getProductsBySearch: (...args: unknown[]) => mockGetProductsBySearch(...args),
  getSuppliersForFilter: vi.fn().mockResolvedValue([]),
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
  printThermalReceipt: vi.fn().mockResolvedValue(undefined),
  exportToPDF: vi.fn().mockResolvedValue(undefined),
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

const createMockProduct = (overrides: Partial<Product> = {}): Product => {
  const product = new Product();
  product.id = overrides.id ?? "prod-1";
  product.code = overrides.code ?? "CODE001";
  product.description = overrides.description ?? "Test Product";
  product.salePrice = overrides.salePrice ?? 100;
  product.amount = overrides.amount ?? 10;
  product.unit = overrides.unit ?? "unidades";
  return product;
};

const createMockBillState = (overrides: Partial<BillState> = {}): BillState => ({
  id: overrides.id || "",
  products: overrides.products || [],
  total: overrides.total || 0,
  totalWithDiscount: overrides.totalWithDiscount || 0,
  seller: overrides.seller || "test@example.com",
  discount: overrides.discount || 0,
  date: overrides.date || new Date(),
  typeDocument: overrides.typeDocument || "DNI",
  documentNumber: overrides.documentNumber || 0,
  IVACondition: overrides.IVACondition || "Consumidor Final",
  twoMethods: overrides.twoMethods || false,
  paidMethod: overrides.paidMethod || "Efectivo",
  client: overrides.client || "Test Client",
  ...overrides,
});

const mockContextValue = {
  BillState: createMockBillState(),
  dispatch: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
  onOrderResetRef: { current: null },
  printMode: "thermal" as const,
  setPrintMode: vi.fn(),
  qzTrayActive: false,
  setQzTrayActive: vi.fn(),
};

const mockSession = {
  user: {
    businessName: "Test Business Name",
    email: "test@example.com",
    name: "Test User",
  },
};

const renderWithMocks = (externalState?: BillState) => {
  return render(
    <BillContext.Provider value={{ ...mockContextValue, BillState: externalState || createMockBillState() }}>
      <PrintableTable
        printTrigger={0}
        className=""
        handleClose={vi.fn()}
        session={mockSession as never}
        externalState={externalState}
      />
    </BillContext.Provider>
  );
};

// Production barcode timeout constant is 900ms (not 300ms).
const BARCODE_TIMEOUT_MS = 900;

describe("PrintableTable Barcode Scanning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useFeatures).mockReturnValue({
      plan: "PRO",
      hasFeature: () => false,
      isDelinquent: false,
      isPlanAtLeast: () => true,
      isOverLimit: () => false,
    } as any);
    mockGetProductsByCode.mockResolvedValue([]);
    mockGetProductsBySearch.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Barcode Detection by Timing", () => {
    it("should detect barcode mode when inter-keystroke time is less than 50ms", async () => {
      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "123" } });

      // Advance past the 900ms barcode timeout
      vi.advanceTimersByTime(BARCODE_TIMEOUT_MS);

      await vi.waitFor(() => {
        expect(mockGetProductsByCode).toHaveBeenCalledWith("123");
      });
    });

    it("should not detect barcode mode when inter-keystroke time is greater than 50ms", async () => {
      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "123" } });

      // Advance past the 300ms manual search debounce
      vi.advanceTimersByTime(300);

      expect(mockGetProductsBySearch).toHaveBeenCalledWith("123");
      expect(mockGetProductsByCode).not.toHaveBeenCalled();
    });
  });

  describe("Barcode Lookup with getProductsByCode", () => {
    it("should call getProductsByCode when barcode is detected", async () => {
      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "123" } });

      vi.advanceTimersByTime(BARCODE_TIMEOUT_MS);

      await vi.waitFor(() => {
        expect(mockGetProductsByCode).toHaveBeenCalledWith("123");
      });
    });
  });

  describe("Manual Typing Still Works", () => {
    it("should call getProductsBySearch for manual typing", async () => {
      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "a" } });

      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "ab" } });

      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "abc" } });

      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "test" } });

      vi.advanceTimersByTime(300);

      expect(mockGetProductsBySearch).toHaveBeenCalledWith("test");
      expect(mockGetProductsByCode).not.toHaveBeenCalled();
    });
  });

  describe("Timeout Reset After 900ms", () => {
    it("should process barcode after 900ms of no keystrokes", async () => {
      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "123" } });

      vi.advanceTimersByTime(BARCODE_TIMEOUT_MS);

      await vi.waitFor(() => {
        expect(mockGetProductsByCode).toHaveBeenCalledWith("123");
      });
    });

    it("should not process barcode if less than 3 characters after timeout", async () => {
      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(BARCODE_TIMEOUT_MS);

      expect(mockGetProductsByCode).not.toHaveBeenCalled();
    });
  });

  describe("Successful Barcode Scan Adds Product", () => {
    it("should add product to bill when barcode scan succeeds", async () => {
      const mockProduct = createMockProduct({ code: "12345", description: "Scanned Product" });
      // getProductsByCode returns an array with one product
      mockGetProductsByCode.mockResolvedValue([mockProduct]);

      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "123" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "1234" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12345" } });

      vi.advanceTimersByTime(BARCODE_TIMEOUT_MS);

      await vi.waitFor(() => {
        expect(mockContextValue.addItem).toHaveBeenCalled();
      });

      const call = mockContextValue.addItem.mock.calls[0][0];
      expect(call.code).toBe("12345");
      expect(call.amount).toBe(1);
    });
  });

  describe("Failed Barcode Scan Shows Error", () => {
    it("should show error message when product is not found", async () => {
      mockGetProductsByCode.mockResolvedValue([]);

      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "123" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "99999" } });

      vi.advanceTimersByTime(BARCODE_TIMEOUT_MS);

      await vi.waitFor(() => {
        expect(screen.getByText("Producto no encontrado")).toBeTruthy();
      });
    });

    it("should show error message when product is out of stock", async () => {
      const mockProduct = createMockProduct({ code: "12345", amount: 0 });
      // getProductsByCode returns array with one out-of-stock product
      mockGetProductsByCode.mockResolvedValue([mockProduct]);

      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "123" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12345" } });

      vi.advanceTimersByTime(BARCODE_TIMEOUT_MS);

      await vi.waitFor(() => {
        expect(screen.getByText("Producto sin Stock")).toBeTruthy();
      });
    });
  });

  describe("Visual Feedback (Blue Border)", () => {
    it("should apply blue border class when in barcode mode", async () => {
      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "123" } });

      expect(input.className).toContain("ring-2");
      expect(input.className).toContain("ring-blue-500");
    });

    it("should remove blue border after barcode processing completes", async () => {
      const mockProduct = createMockProduct({ code: "12345" });
      mockGetProductsByCode.mockResolvedValue([mockProduct]);

      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "123" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12345" } });

      vi.advanceTimersByTime(BARCODE_TIMEOUT_MS);

      await vi.waitFor(() => {
        expect(input.className).not.toContain("ring-2");
      });
    });
  });

  describe("Preserving Existing Behavior", () => {
    it("should still show suggestions for manual typing with 2 or more characters", async () => {
      const mockProduct = createMockProduct({ description: "Test Search Product" });
      mockGetProductsBySearch.mockResolvedValue([mockProduct]);

      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "t" } });

      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "te" } });

      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "tes" } });

      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "test" } });

      vi.advanceTimersByTime(300);

      expect(mockGetProductsBySearch).toHaveBeenCalledWith("test");
    });

    it("should clear search input after successful barcode scan", async () => {
      const mockProduct = createMockProduct({ code: "12345" });
      mockGetProductsByCode.mockResolvedValue([mockProduct]);

      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "123" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12345" } });

      vi.advanceTimersByTime(BARCODE_TIMEOUT_MS);

      await vi.waitFor(() => {
        expect(input).toHaveValue("");
      });
    });
  });
});
