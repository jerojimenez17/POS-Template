import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PrintableTable from "@/components/Billing/PrintableTable";
import { BillContext } from "@/context/BillContext";
import BillState from "@/models/BillState";
import Product from "@/models/Product";

const mockGetProductByCode = vi.fn().mockResolvedValue(null);
const mockGetProductsBySearch = vi.fn().mockResolvedValue([]);

vi.mock("@/actions/stock", () => ({
  getProductByCode: (...args: unknown[]) => mockGetProductByCode(...args),
  getProductsBySearch: (...args: unknown[]) => mockGetProductsBySearch(...args),
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
  addItem: vi.fn(),
  removeUnit: vi.fn(),
  removeAll: vi.fn(),
  removeItem: vi.fn(),
  changePrice: vi.fn(),
  changeUnit: vi.fn(),
  total: vi.fn(),
  discount: vi.fn(),
  sellerName: vi.fn(),
  typeDocument: vi.fn(),
  documentNumber: vi.fn(),
  entrega: vi.fn(),
  nroAsociado: vi.fn(),
  IVACondition: vi.fn(),
  paidMethod: vi.fn(),
  billType: vi.fn(),
  date: vi.fn(),
  CAE: vi.fn(),
  setState: vi.fn(),
  addUnit: vi.fn(),
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

describe("PrintableTable Barcode Scanning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProductByCode.mockResolvedValue(null);
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

      vi.advanceTimersByTime(300);

      await vi.waitFor(() => {
        expect(mockGetProductByCode).toHaveBeenCalledWith("123");
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

      vi.advanceTimersByTime(300);

      expect(mockGetProductsBySearch).toHaveBeenCalledWith("123");
      expect(mockGetProductByCode).not.toHaveBeenCalled();
    });
  });

  describe("Barcode Lookup with getProductByCode", () => {
    it("should call getProductByCode when barcode is detected", async () => {
      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "123" } });

      vi.advanceTimersByTime(300);

      await vi.waitFor(() => {
        expect(mockGetProductByCode).toHaveBeenCalledWith("123");
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

      expect(mockGetProductsBySearch).toHaveBeenCalledWith("test");
      expect(mockGetProductByCode).not.toHaveBeenCalled();
    });
  });

  describe("Timeout Reset After 300ms", () => {
    it("should reset barcode mode after 300ms of no keystrokes", async () => {
      vi.useFakeTimers();
      renderWithMocks();
      const input = screen.getByPlaceholderText(/Buscar producto/i);

      vi.setSystemTime(0);
      fireEvent.change(input, { target: { value: "1" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "12" } });

      vi.advanceTimersByTime(10);
      fireEvent.change(input, { target: { value: "123" } });

      vi.advanceTimersByTime(300);

      await vi.waitFor(() => {
        expect(mockGetProductByCode).toHaveBeenCalledWith("123");
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

      vi.advanceTimersByTime(300);

      expect(mockGetProductByCode).not.toHaveBeenCalled();
    });
  });

  describe("Successful Barcode Scan Adds Product", () => {
    it("should add product to bill when barcode scan succeeds", async () => {
      const mockProduct = createMockProduct({ code: "12345", description: "Scanned Product" });
      mockGetProductByCode.mockResolvedValue(mockProduct);

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

      vi.advanceTimersByTime(300);

      await vi.waitFor(() => {
        expect(mockContextValue.addItem).toHaveBeenCalled();
      });

      const addedProduct = mockContextValue.addItem.mock.calls[0][0];
      expect(addedProduct.code).toBe("12345");
      expect(addedProduct.amount).toBe(1);
    });
  });

  describe("Failed Barcode Scan Shows Error", () => {
    it("should show error message when product is not found", async () => {
      mockGetProductByCode.mockResolvedValue(null);

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

      vi.advanceTimersByTime(300);

      await vi.waitFor(() => {
        expect(screen.getByText("Producto no encontrado")).toBeTruthy();
      });
    });

    it("should show error message when product is out of stock", async () => {
      const mockProduct = createMockProduct({ code: "12345", amount: 0 });
      mockGetProductByCode.mockResolvedValue(mockProduct);

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

      vi.advanceTimersByTime(300);

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
      mockGetProductByCode.mockResolvedValue(mockProduct);

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

      vi.advanceTimersByTime(300);

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

      expect(mockGetProductsBySearch).toHaveBeenCalledWith("test");
    });

    it("should clear search input after successful barcode scan", async () => {
      const mockProduct = createMockProduct({ code: "12345" });
      mockGetProductByCode.mockResolvedValue(mockProduct);

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

      vi.advanceTimersByTime(300);

      await vi.waitFor(() => {
        expect(input).toHaveValue("");
      });
    });
  });
});
