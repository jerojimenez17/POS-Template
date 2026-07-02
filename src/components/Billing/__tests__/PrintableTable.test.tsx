import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PrintableTable from "@/components/Billing/PrintableTable";
import { BillContext } from "@/context/BillContext";
import BillState from "@/models/BillState";
import Product from "@/models/Product";
import CAE from "@/models/CAE";

vi.mock("@/hooks/useFeatures", () => ({
  useFeatures: vi.fn(),
}));

import { useFeatures } from "@/hooks/useFeatures";

vi.mock("@/actions/stock", () => ({
  getProductByCode: vi.fn().mockResolvedValue(null),
  getProductsByCode: vi.fn().mockResolvedValue([]),
  getProductsBySearch: vi.fn().mockResolvedValue([]),
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
  product.id = overrides.id || "prod-1";
  product.code = overrides.code || "CODE001";
  product.description = overrides.description || "Test Product";
  product.salePrice = overrides.salePrice || 100;
  product.amount = overrides.amount || 1;
  product.unit = overrides.unit || "unidades";
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

const createMockCAE = (): CAE => ({
  CAE: "1234567890123",
  vencimiento: "31/12/2026",
  nroComprobante: 1,
  qrData: "https://www.afip.gob.ar/fe/qr/?p=eyJtb2RhbCI6ImZBIiwic2VsbGVyIjoiMjAxMjM0NTY3ODkiLCJudW1iZXIiOiIxMjM0NTY3ODkwMTIiLCJtb21lbnQiOiIyMDI2LTAxLTE1In0=",
});

const mockContextValue = {
  BillState: createMockBillState(),
  dispatch: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
  onOrderResetRef: { current: null },
  printMode: "thermal" as const,
  setPrintMode: vi.fn(),
  qzTrayActive: true,
  setQzTrayActive: vi.fn(),
};

const renderWithContext = (ui: React.ReactElement, contextValue = mockContextValue) => {
  return render(
    <BillContext.Provider value={contextValue}>
      {ui}
    </BillContext.Provider>
  );
};

const mockSession = {
  user: {
    businessName: "Test Business Name",
    email: "test@example.com",
    name: "Test User",
  },
};

describe("PrintableTable Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useFeatures).mockReturnValue({
      plan: "PRO",
      hasFeature: () => false,
      isDelinquent: false,
      isPlanAtLeast: () => true,
      isOverLimit: () => false,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("CA-01: Component renders correctly", () => {
    it("should render the product table with headers", () => {
      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      expect(screen.getByText("Producto")).toBeTruthy();
      expect(screen.getByText("Cantidad")).toBeTruthy();
      expect(screen.getByText("Precio")).toBeTruthy();
      expect(screen.getAllByText("Subtotal").length).toBeGreaterThan(0);
    });

    it("should display empty state when no products", () => {
      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      expect(screen.getByText("No hay productos agregados")).toBeTruthy();
      expect(screen.getByText("Buscá un producto para comenzar")).toBeTruthy();
    });

    it("should render with custom className", () => {
      const { container } = renderWithContext(
        <PrintableTable
          printTrigger={0}
          className="custom-class"
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      const element = container.firstChild as HTMLElement | null;
      expect(element?.className).toContain("custom-class");
    });

    it("should display products when provided via externalState", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100 }),
        createMockProduct({ id: "2", description: "Product 2", salePrice: 200 }),
      ];

      const billState = createMockBillState({ products });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText("Product 1")).toBeTruthy();
      expect(screen.getByText("Product 2")).toBeTruthy();
    });
  });

  describe("CA-02: Print function is called when trigger is activated", () => {
    it("should call handlePrint when printTrigger increases", async () => {
      // Production uses printThermalReceipt (thermal mode) or exportToPDF (pdf mode),
      // not the old printElement. We verify the correct function is called.
      const { printThermalReceipt } = await import("@/lib/print");

      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
      });

      const { rerender } = renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Test Product")).toBeTruthy();
      });

      // isClient becomes true after useEffect — flush it
      await waitFor(() => {});

      rerender(
        <BillContext.Provider value={{ ...mockContextValue, BillState: billState }}>
          <PrintableTable
            printTrigger={1}
            className=""
            handleClose={vi.fn()}
            session={mockSession as never}
            externalState={billState}
          />
        </BillContext.Provider>
      );

      await waitFor(() => {
        expect(printThermalReceipt).toHaveBeenCalled();
      });
    });

    it("should not trigger print when printTrigger is 0", async () => {
      const { printThermalReceipt, exportToPDF } = await import("@/lib/print");

      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />,
        { ...mockContextValue }
      );

      await waitFor(() => {
        expect(screen.getByText("Test Product")).toBeTruthy();
      });

      expect(printThermalReceipt).not.toHaveBeenCalled();
      expect(exportToPDF).not.toHaveBeenCalled();
    });
  });

  describe("CA-03: Print styles are applied correctly", () => {
    it("should have print-visible class for header section when CAE is present", async () => {
      // The print-visible header is gated behind isClient (useEffect) AND requires CAE.
      // Wait for the client effect to run before querying.
      const cae = createMockCAE();
      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        CAE: cae,
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      await waitFor(() => {
        const headerElements = document.querySelectorAll(".print-visible");
        expect(headerElements.length).toBeGreaterThan(0);
      });
    });

    it("should have print:hidden class for interactive elements", () => {
      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      const hiddenElements = document.querySelectorAll(".print\\:hidden");
      expect(hiddenElements.length).toBeGreaterThan(0);
    });

    it("should display product search only on screen (print:hidden)", () => {
      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      // Actual placeholder includes the keyboard shortcut hint
      const searchInput = screen.getByPlaceholderText(/Buscar producto por codigo o nombre/);
      expect(searchInput).toBeTruthy();
      expect(searchInput.closest(".print\\:hidden")).toBeTruthy();
    });
  });

  describe("CA-04: Fallback to PDF functionality", () => {
    it("should have CAE section with QR code for authorized bills", () => {
      const cae = createMockCAE();

      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        CAE: cae,
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText("Comprobante Autorizado")).toBeTruthy();
      expect(screen.getByText(/CAE:/)).toBeTruthy();
      expect(screen.getByText("1234567890123")).toBeTruthy();
      expect(screen.getByText(/Vencimiento:/)).toBeTruthy();
      expect(screen.getByText("31/12/2026")).toBeTruthy();
    });

    it("should not display CAE section when CAE is not present", () => {
      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      expect(screen.queryByText("Comprobante Autorizado")).toBeNull();
    });

    it("should display QR code placeholder when qrData is missing", () => {
      const caeWithoutQR: CAE = {
        CAE: "1234567890123",
        vencimiento: "31/12/2026",
        nroComprobante: 1,
        qrData: "",
      };

      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        CAE: caeWithoutQR,
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText(/CAE:/)).toBeTruthy();
      const qrPlaceholder = document.querySelector(".print-visible .w-\\[110px\\]");
      expect(qrPlaceholder).toBeTruthy();
    });
  });

  describe("CA-05: QR Code CAE included in print", () => {
    it("should render QRCodeSVG with qrData from CAE", () => {
      const cae = createMockCAE();

      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        CAE: cae,
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      const qrCodeSVGs = document.querySelectorAll('svg');
      expect(qrCodeSVGs.length).toBeGreaterThan(0);
    });

    it("should display CAE number in print section", () => {
      const cae = createMockCAE();

      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        CAE: cae,
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText("1234567890123")).toBeTruthy();
    });
  });

  describe("CA-06: Business header in print", () => {
    it("should display business name in print header", () => {
      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      expect(screen.getByText("Test Business Name")).toBeTruthy();
    });

    it("should display billing info when available", async () => {
      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Test Business/)).toBeTruthy();
      });
      expect(screen.getByText(/CUIT:/)).toBeTruthy();
      expect(screen.getByText("20123456789")).toBeTruthy();
    });
  });

  describe("CA-07: Client information in print", () => {
    it("should display client name when provided", () => {
      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        client: "Juan Pérez",
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText(/Cliente:/)).toBeTruthy();
      expect(screen.getByText("Juan Pérez")).toBeTruthy();
    });

    it("should display client IVA condition when provided", () => {
      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        client: "Empresa ABC",
        clientIvaCondition: "Responsable Inscripto",
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText(/Condición IVA:/)).toBeTruthy();
      expect(screen.getByText("Responsable Inscripto")).toBeTruthy();
    });

    it("should not display client document for Consumidor Final", () => {
      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        client: "Consumidor Final",
        clientIvaCondition: "consumidor final",
        clientDocumentNumber: undefined,
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.queryByText(/Documento:/)).toBeNull();
    });
  });

  describe("CA-08: Product table calculations", () => {
    it("should calculate subtotal correctly for each product", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100, amount: 2 }),
        createMockProduct({ id: "2", description: "Product 2", salePrice: 50, amount: 3 }),
      ];

      const billState = createMockBillState({ products });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText("$200,00")).toBeTruthy();
      expect(screen.getByText("$150,00")).toBeTruthy();
    });

    it("should calculate total with discount", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 100, amount: 1 }),
      ];

      const billState = createMockBillState({
        products,
        discount: 10,
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText(/Descuento/)).toBeTruthy();
      expect(screen.getByText("$90,00")).toBeTruthy();
    });

    it("should display unit price formatted correctly", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1", salePrice: 123.45, amount: 1 }),
      ];

      const billState = createMockBillState({ products });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getAllByText("$123,45").length).toBeGreaterThan(0);
    });
  });

  describe("CA-09: Product search functionality", () => {
    it("should render search input", () => {
      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      // Actual placeholder: "Buscar producto por codigo o nombre (Presiona '/' para buscar)..."
      const searchInput = screen.getByPlaceholderText(/Buscar producto por codigo o nombre/);
      expect(searchInput).toBeTruthy();
    });

    it("should render scanner button", () => {
      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      const scanButton = screen.getByLabelText("Escanear codigo");
      expect(scanButton).toBeTruthy();
    });

    it("should render remove button for each product", () => {
      const products = [
        createMockProduct({ id: "1", description: "Product 1" }),
        createMockProduct({ id: "2", description: "Product 2" }),
      ];

      const billState = createMockBillState({ products });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      const removeButtons = screen.getAllByLabelText(/Eliminar/);
      expect(removeButtons.length).toBe(2);
    });
  });

  describe("CA-10: Date and document type display", () => {
    it("should display bill type as Factura when CAE is present", () => {
      const cae = createMockCAE();

      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        CAE: cae,
        billType: "C",
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText(/Factura:/)).toBeTruthy();
      expect(screen.getByText("C")).toBeTruthy();
    });

    it("should display bill type as Remito when no CAE", () => {
      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
        />
      );

      expect(screen.getByText(/Comprobante:/)).toBeTruthy();
      expect(screen.getByText("Remito")).toBeTruthy();
    });

    it("should display formatted date", () => {
      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        date: new Date("2024-03-15T14:30:00"),
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText(/Fecha:/)).toBeTruthy();
      expect(screen.getByText(/15\/3\/24/)).toBeTruthy();
    });

    it("should display seller information", () => {
      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        seller: "vendedor@test.com",
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText(/Vendedor:/)).toBeTruthy();
      expect(screen.getByText("vendedor@test.com")).toBeTruthy();
    });

    it("should display payment method", () => {
      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        paidMethod: "Tarjeta de Crédito",
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText(/Medio de Pago:/)).toBeTruthy();
      expect(screen.getByText("Tarjeta de Crédito")).toBeTruthy();
    });
  });

  describe("CA-11: AFIP footer in print section", () => {
    it("should display AFIP placeholder", () => {
      const cae = createMockCAE();

      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
        CAE: cae,
      });

      renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      expect(screen.getByText("AFIP")).toBeTruthy();
    });
  });

  describe("CA-12: Print page styles configuration", () => {
    it("should call printThermalReceipt with receipt data when triggered (thermal mode)", async () => {
      // Production uses printThermalReceipt (thermal) / exportToPDF (pdf), not printElement.
      const { printThermalReceipt } = await import("@/lib/print");

      const billState = createMockBillState({
        products: [createMockProduct({ description: "Test Product" })],
      });

      const { rerender } = renderWithContext(
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={vi.fn()}
          session={mockSession as never}
          externalState={billState}
        />
      );

      // Let isClient become true
      await waitFor(() => {});

      rerender(
        <BillContext.Provider value={{ ...mockContextValue, BillState: billState }}>
          <PrintableTable
            printTrigger={1}
            className=""
            handleClose={vi.fn()}
            session={mockSession as never}
            externalState={billState}
          />
        </BillContext.Provider>
      );

      await waitFor(() => {
        expect(printThermalReceipt).toHaveBeenCalled();
      });

      const call = (printThermalReceipt as ReturnType<typeof vi.fn>).mock.calls[0];
      const receiptData = call[0] as Record<string, unknown>;
      // Verify receipt data has the expected shape
      expect(receiptData).toHaveProperty("businessName");
      expect(receiptData).toHaveProperty("products");
      expect(receiptData).toHaveProperty("total");
    });
  });
});
