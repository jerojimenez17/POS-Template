import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─────────────────────────────────────────────────────────────
// Mocks (must be registered before importing the SUT)
// ─────────────────────────────────────────────────────────────

// Mock axios BEFORE importing the action that uses it.
const mockAxiosPost = vi.fn();

vi.mock("axios", () => ({
  default: {
    post: (...args: unknown[]) => mockAxiosPost(...args),
    isAxiosError: (err: unknown) => {
      return (
        typeof err === "object" &&
        err !== null &&
        "isAxiosError" in err &&
        (err as { isAxiosError?: boolean }).isAxiosError === true
      );
    },
  },
  isAxiosError: (err: unknown) => {
    return (
      typeof err === "object" &&
      err !== null &&
      "isAxiosError" in err &&
      (err as { isAxiosError?: boolean }).isAxiosError === true
    );
  },
}));

// Mock requireFeature from auth-gates
const mockRequireFeature = vi.fn();
vi.mock("@/lib/auth-gates", () => ({
  requireFeature: (...args: unknown[]) => mockRequireFeature(...args),
}));

// Mock getArcaCredentialsForBilling
const mockGetArcaCredentialsForBilling = vi.fn();
vi.mock("@/actions/arca", () => ({
  getArcaCredentialsForBilling: (...args: unknown[]) =>
    mockGetArcaCredentialsForBilling(...args),
}));

// Import SUT AFTER mocks are in place
import { createAfipVoucherAction } from "@/actions/afip";
import type BillState from "@/models/BillState";

// ─────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────

// The action only reads { id, code, description, price, salePrice, amount }
// from each product. We use a loose type for the test fixtures and cast
// to the BillState shape at the call site.
type MinimalProduct = {
  id: string;
  code: string;
  description: string;
  price: number;
  salePrice: number;
  amount: number;
};

type TestBillState = {
  id: string;
  products: MinimalProduct[];
  total: number;
  totalWithDiscount: number;
  seller: string;
  discount: number;
  date: Date;
  typeDocument: string;
  documentNumber: number;
  IVACondition: string;
  twoMethods: boolean;
  ptoVenta: number;
};

const asBillState = (bs: TestBillState): BillState =>
  bs as unknown as BillState;

const buildBillState = (overrides: Partial<TestBillState> = {}): TestBillState => ({
  id: "bill-1",
  products: [],
  total: 0,
  totalWithDiscount: 0,
  seller: "Cajero",
  discount: 0,
  date: new Date("2026-08-13T10:00:00Z"),
  typeDocument: "FACTURA",
  documentNumber: 20123456789,
  IVACondition: "Consumidor Final",
  twoMethods: false,
  ptoVenta: 1,
  ...overrides,
});

const buildShortcutProduct = (
  salePrice: number,
  amount = 1
): MinimalProduct => ({
  id: "p1",
  code: "SHORT-001",
  description: "Producto de atajo (precio variable)",
  price: 0,
  salePrice,
  amount,
});

const buildCatalogProduct = (
  price: number,
  salePrice: number,
  amount = 1
): MinimalProduct => ({
  id: "p2",
  code: "CAT-001",
  description: "Producto de catalogo",
  price,
  salePrice,
  amount,
});

// ─────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────

describe("createAfipVoucherAction — fix-shortcut-zero-price-afip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set environment variables required by the action
    process.env.AFIP_SDK_ACCESS_TOKEN = "test-access-token";
    process.env.INTERNAL_AFIP_API_KEY = "test-internal-key";

    // Default mocks: auth gate passes + credentials returned
    mockRequireFeature.mockResolvedValue({ success: true, data: {} });
    mockGetArcaCredentialsForBilling.mockResolvedValue({
      success: {
        cuit: "20123456789",
        cert: "encrypted-cert",
        key: "encrypted-key",
      },
    });
    // Default: axios.post resolves with a fake success response
    mockAxiosPost.mockResolvedValue({
      data: { success: true, cae: "12345678901234" },
    });
  });

  afterEach(() => {
    delete process.env.AFIP_SDK_ACCESS_TOKEN;
    delete process.env.INTERNAL_AFIP_API_KEY;
  });

  // ───────── CA-01: shortcut product with confirmed price ─────────

  it("CA-01: payload contiene price = salePrice cuando el producto es un shortcut (price=0, salePrice=150.50)", async () => {
    // Arrange
    const billState = buildBillState({
      products: [buildShortcutProduct(150.5, 1)],
      total: 150.5,
      totalWithDiscount: 150.5,
    });

    // Act
    await createAfipVoucherAction(asBillState(billState));

    // Assert
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const callArgs = mockAxiosPost.mock.calls[0];
    const payload = callArgs[1] as {
      action: string;
      billState: { products: Array<{ price: number; salePrice: number }> };
    };
    expect(payload.billState.products[0].price).toBe(150.5);
    expect(payload.billState.products[0].salePrice).toBe(150.5);
  });

  // ───────── CA-02: normal catalog product (no regression) ─────────

  it("CA-02: payload contiene price = price del catalogo cuando es un producto normal (price=100, salePrice=100)", async () => {
    // Arrange
    const billState = buildBillState({
      products: [buildCatalogProduct(100, 100, 2)],
      total: 200,
      totalWithDiscount: 200,
    });

    // Act
    await createAfipVoucherAction(asBillState(billState));

    // Assert
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const callArgs = mockAxiosPost.mock.calls[0];
    const payload = callArgs[1] as {
      billState: { products: Array<{ price: number; salePrice: number }> };
    };
    expect(payload.billState.products[0].price).toBe(100);
    expect(payload.billState.products[0].salePrice).toBe(100);
  });

  // ───────── CA-03: salePrice=0 but price>0 (catalog product without salePrice override) ─────────

  it("CA-03: payload contiene price = price del catalogo cuando salePrice=0 pero price>0 (caso normal de catalogo)", async () => {
    // Arrange
    const billState = buildBillState({
      products: [buildCatalogProduct(50, 0, 1)],
      total: 50,
      totalWithDiscount: 50,
    });

    // Act
    await createAfipVoucherAction(asBillState(billState));

    // Assert
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const callArgs = mockAxiosPost.mock.calls[0];
    const payload = callArgs[1] as {
      billState: { products: Array<{ price: number; salePrice: number }> };
    };
    // price must be 50 (from the catalog field), NOT 0
    expect(payload.billState.products[0].price).toBe(50);
  });

  // ───────── CA-04: both price and salePrice = 0 (no transformation possible) ─────────

  it("CA-04: cuando price=0 y salePrice=0, el payload contiene price=0 (sin transformacion)", async () => {
    // Arrange
    const billState = buildBillState({
      products: [{ ...buildShortcutProduct(0, 1) }],
      total: 0,
      totalWithDiscount: 0,
    });

    // Act
    await createAfipVoucherAction(asBillState(billState));

    // Assert
    // The action should reject the bill locally and NOT call the cloud function.
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  // ───────── CA-05: effectiveTotal = 0 → return error, no HTTP call ─────────

  it("CA-05: cuando effectiveTotal = 0, retorna error en espanol y NO llama al Cloud Function", async () => {
    // Arrange
    const billState = buildBillState({
      products: [buildShortcutProduct(0, 1)],
      total: 0,
      totalWithDiscount: 0,
    });

    // Act
    const result = await createAfipVoucherAction(asBillState(billState));

    // Assert
    expect(result).toEqual({
      error: "No se puede generar la factura: el monto total debe ser mayor a 0",
    });
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  // ───────── CA-06: effectiveTotal > 0 → call cloud function ─────────

  it("CA-06: cuando effectiveTotal > 0, llama al Cloud Function normalmente", async () => {
    // Arrange
    const billState = buildBillState({
      products: [buildShortcutProduct(150.5, 1)],
      total: 150.5,
      totalWithDiscount: 150.5,
    });

    // Act
    const result = await createAfipVoucherAction(asBillState(billState));

    // Assert
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      data: { success: true, cae: "12345678901234" },
    });
  });

  // ───────── CA-07: regression test for credentials and billState structure ─────────

  it("CA-07: envia credenciales correctas (cuit/cert/key/accessToken) y estructura billState esperada al Cloud Function", async () => {
    // Arrange
    const billState = buildBillState({
      products: [buildCatalogProduct(100, 100, 1)],
      total: 100,
      totalWithDiscount: 100,
    });

    // Act
    await createAfipVoucherAction(asBillState(billState));

    // Assert
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const [url, payload, config] = mockAxiosPost.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { headers: Record<string, string> },
    ];

    // URL
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);

    // Credentials
    expect(payload.encryptedCert).toBe("encrypted-cert");
    expect(payload.encryptedKey).toBe("encrypted-key");
    expect((payload.arca as { cuit: string }).cuit).toBe("20123456789");
    expect((payload.arca as { accessToken: string }).accessToken).toBe(
      "test-access-token"
    );
    expect((payload.arca as { puntoVenta: number }).puntoVenta).toBe(1);

    // Action
    expect(payload.action).toBe("createVoucher");

    // Bill state has expected fields
    const billStateSent = payload.billState as Record<string, unknown>;
    expect(billStateSent).toHaveProperty("products");
    expect(billStateSent).toHaveProperty("total", 100);
    expect(billStateSent).toHaveProperty("discount", 0);
    expect(billStateSent).toHaveProperty("seller", "Cajero");
    // ptoVenta should NOT be in billState (it is on arca)
    expect(billStateSent).not.toHaveProperty("ptoVenta");

    // Headers
    expect(config.headers["Content-Type"]).toBe("application/json");
    expect(config.headers["x-internal-key"]).toBe("test-internal-key");
  });

  // ───────── Edge: discount that brings effective total to 0 ─────────

  it("Edge: cuando un descuento lleva el total a 0, retorna error sin llamar al Cloud Function", async () => {
    // Arrange
    const billState = buildBillState({
      products: [buildShortcutProduct(100, 1)],
      total: 100,
      totalWithDiscount: 0, // discount wiped the total
      discount: 100,
    });

    // Act
    const result = await createAfipVoucherAction(asBillState(billState));

    // Assert
    expect(result).toEqual({
      error: "No se puede generar la factura: el monto total debe ser mayor a 0",
    });
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  // ───────── Edge: mix of shortcut and catalog products ─────────

  it("Edge: con mezcla de productos (shortcut + catalogo), cada uno usa su precio efectivo", async () => {
    // Arrange
    const billState = buildBillState({
      products: [
        buildShortcutProduct(50, 2), // shortcut: salePrice=50, amount=2 → 100
        buildCatalogProduct(80, 80, 1), // catalog: price=80, amount=1 → 80
      ],
      total: 180,
      totalWithDiscount: 180,
    });

    // Act
    await createAfipVoucherAction(asBillState(billState));

    // Assert
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const callArgs = mockAxiosPost.mock.calls[0];
    const payload = callArgs[1] as {
      billState: { products: Array<{ id: string; price: number; amount: number }> };
    };

    const products = payload.billState.products;
    expect(products).toHaveLength(2);

    // Shortcut product: price should be 50 (from salePrice), not 0
    const shortcut = products.find((p) => p.id === "p1");
    expect(shortcut).toBeDefined();
    expect(shortcut?.price).toBe(50);
    expect(shortcut?.amount).toBe(2);

    // Catalog product: price should be 80 (from price)
    const catalog = products.find((p) => p.id === "p2");
    expect(catalog).toBeDefined();
    expect(catalog?.price).toBe(80);
    expect(catalog?.amount).toBe(1);
  });
});
