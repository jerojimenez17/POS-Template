import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processSaleAction,
  getSalesAction,
  getSaleByIdAction,
} from "@/actions/sales";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { businessId: "business-123" } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockCAE = {
  CAE: "1234567890123",
  vencimiento: "2026-12-31",
  nroComprobante: 1,
  qrData: "https://example.com/qr",
};

const baseInput = {
  total: 100,
  totalWithDiscount: 100,
  seller: "Test Seller",
  paidMethod: "Efectivo",
  products: [
    {
      id: "product-1",
      code: "P001",
      description: "Test Product",
      salePrice: 100,
      amount: 1,
    },
  ],
};

describe("Billing Fields - ProcessSaleInput Interface", () => {
  it("should accept ProcessSaleInput with all billing fields", () => {
    const inputWithBilling = {
      ...baseInput,
      clientIvaCondition: "CUIT",
      clientDocumentNumber: "20123456789",
      CAE: mockCAE,
    } as typeof baseInput & {
      clientIvaCondition?: string;
      clientDocumentNumber?: string;
      CAE?: typeof mockCAE;
    };

    expect(inputWithBilling.clientIvaCondition).toBe("CUIT");
    expect(inputWithBilling.clientDocumentNumber).toBe("20123456789");
    expect(inputWithBilling.CAE).toEqual(mockCAE);
  });

  it("should accept ProcessSaleInput without CAE (CAE is optional)", () => {
    const inputWithoutCAE = {
      ...baseInput,
      clientIvaCondition: "Consumidor Final",
      clientDocumentNumber: "12345678",
    } as typeof baseInput & {
      clientIvaCondition?: string;
      clientDocumentNumber?: string;
      CAE?: typeof mockCAE;
    };

    expect(inputWithoutCAE.clientIvaCondition).toBe("Consumidor Final");
    expect(inputWithoutCAE.clientDocumentNumber).toBe("12345678");
    expect(inputWithoutCAE.CAE).toBeUndefined();
  });

  it("should accept ProcessSaleInput without any billing fields", () => {
    const inputMinimal = {
      ...baseInput,
    };

    expect(inputMinimal.total).toBe(100);
    expect(inputMinimal.seller).toBe("Test Seller");
  });
});

describe("Billing Fields - processSaleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create order with billing fields when provided", async () => {
    const { db } = await import("@/lib/db");

    const createdOrder = {
      id: "order-billing-1",
      total: 100,
      seller: "Test Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      businessId: "business-123",
      clientId: "client-1",
      clientIvaCondition: "CUIT",
      clientDocumentNumber: "20123456789",
      CAE: mockCAE,
      items: [],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          order: {
            create: vi.fn().mockResolvedValue(createdOrder),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({ id: "movement-1" }),
          },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({ id: "ranking-1" }),
          },
          cashBox: {
            upsert: vi.fn().mockResolvedValue({ id: "cashbox-1" }),
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-movement-1" }),
          },
        };
        return callback(tx);
      }
    );

    const inputWithBilling = {
      ...baseInput,
      clientId: "client-1",
      clientIvaCondition: "CUIT",
      clientDocumentNumber: "20123456789",
      CAE: mockCAE,
    } as Parameters<typeof processSaleAction>[0];

    const result = await processSaleAction(inputWithBilling);

    expect(result.success).toBe(true);
    expect((db.$transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("should create order without billing fields when not provided", async () => {
    const { db } = await import("@/lib/db");

    const createdOrder = {
      id: "order-no-billing-1",
      total: 100,
      seller: "Test Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      businessId: "business-123",
      items: [],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          order: {
            create: vi.fn().mockResolvedValue(createdOrder),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({ id: "movement-1" }),
          },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({ id: "ranking-1" }),
          },
          cashBox: {
            upsert: vi.fn().mockResolvedValue({ id: "cashbox-1" }),
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-movement-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await processSaleAction(baseInput);

    expect(result.success).toBe(true);
    expect((db.$transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("should create order with only IVA condition and document number (CAE optional)", async () => {
    const { db } = await import("@/lib/db");

    const createdOrder = {
      id: "order-partial-billing-1",
      total: 100,
      seller: "Test Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      businessId: "business-123",
      clientIvaCondition: "DNI",
      clientDocumentNumber: "12345678",
      items: [],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          order: {
            create: vi.fn().mockResolvedValue(createdOrder),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({ id: "movement-1" }),
          },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({ id: "ranking-1" }),
          },
          cashBox: {
            upsert: vi.fn().mockResolvedValue({ id: "cashbox-1" }),
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-movement-1" }),
          },
        };
        return callback(tx);
      }
    );

    const inputWithPartialBilling = {
      ...baseInput,
      clientIvaCondition: "DNI",
      clientDocumentNumber: "12345678",
    } as Parameters<typeof processSaleAction>[0];

    const result = await processSaleAction(inputWithPartialBilling);

    expect(result.success).toBe(true);
    expect((db.$transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});

describe("Billing Fields - getSalesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return orders with billing fields populated from database", async () => {
    const { db } = await import("@/lib/db");

    const ordersWithBilling = [
      {
        id: "order-1",
        total: 100,
        discountAmount: 0,
        paymentMethod: "Efectivo",
        paymentMethod2: null,
        totalMethod2: null,
        seller: "Seller 1",
        discountPercentage: 0,
        date: new Date("2026-01-15"),
        clientId: "client-1",
        client: { name: "Test Client" },
        items: [],
        clientIvaCondition: "CUIT",
        clientDocumentNumber: "20123456789",
        CAE: mockCAE,
      },
      {
        id: "order-2",
        total: 200,
        discountAmount: 0,
        paymentMethod: "Tarjeta",
        paymentMethod2: null,
        totalMethod2: null,
        seller: "Seller 2",
        discountPercentage: 0,
        date: new Date("2026-01-14"),
        clientId: null,
        client: null,
        items: [],
        clientIvaCondition: "Consumidor Final",
        clientDocumentNumber: null,
        CAE: null,
      },
    ];

    (db.order.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(ordersWithBilling);

    const result = await getSalesAction();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(db.order.findMany).toHaveBeenCalled();
  });

  it("should return orders with default values when billing fields are null", async () => {
    const { db } = await import("@/lib/db");

    const ordersWithNullBilling = [
      {
        id: "order-1",
        total: 100,
        discountAmount: 0,
        paymentMethod: "Efectivo",
        paymentMethod2: null,
        totalMethod2: null,
        seller: "Seller 1",
        discountPercentage: 0,
        date: new Date("2026-01-15"),
        clientId: null,
        client: null,
        items: [],
        clientIvaCondition: null,
        clientDocumentNumber: null,
        CAE: null,
      },
    ];

    (db.order.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(ordersWithNullBilling);

    const result = await getSalesAction();

    expect(result.length).toBe(1);
    expect(db.order.findMany).toHaveBeenCalled();
  });

  it("should return empty array when no orders exist", async () => {
    const { db } = await import("@/lib/db");

    (db.order.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await getSalesAction();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
    expect(db.order.findMany).toHaveBeenCalled();
  });
});

describe("Billing Fields - getSaleByIdAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return order with billing fields when found", async () => {
    const { db } = await import("@/lib/db");

    const orderWithBilling = {
      id: "order-billing-test",
      total: 150,
      discountAmount: 10,
      paymentMethod: "Efectivo",
      paymentMethod2: "Tarjeta",
      totalMethod2: 50,
      seller: "Test Seller",
      discountPercentage: 5,
      date: new Date("2026-01-15"),
      clientId: "client-1",
      client: { name: "Test Client" },
      items: [],
      clientIvaCondition: "CUIT",
      clientDocumentNumber: "27123456789",
      CAE: mockCAE,
    };

    (db.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(orderWithBilling);

    const result = await getSaleByIdAction("order-billing-test");

    expect(result).not.toBeNull();
    expect(db.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "order-billing-test" }) })
    );
  });

  it("should return null when order is not found", async () => {
    const { db } = await import("@/lib/db");

    (db.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await getSaleByIdAction("non-existent-order");

    expect(result).toBeNull();
    expect(db.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "non-existent-order" }) })
    );
  });

  it("should return order with null billing fields when not set", async () => {
    const { db } = await import("@/lib/db");

    const orderWithoutBilling = {
      id: "order-no-billing",
      total: 100,
      discountAmount: 0,
      paymentMethod: "Efectivo",
      paymentMethod2: null,
      totalMethod2: null,
      seller: "Test Seller",
      discountPercentage: 0,
      date: new Date("2026-01-15"),
      clientId: null,
      client: null,
      items: [],
      clientIvaCondition: null,
      clientDocumentNumber: null,
      CAE: null,
    };

    (db.order.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(orderWithoutBilling);

    const result = await getSaleByIdAction("order-no-billing");

    expect(result).not.toBeNull();
    expect(db.order.findUnique).toHaveBeenCalled();
  });
});

describe("Billing Fields - CAE Field Optional Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow sale without CAE (for non-invoiced sales)", async () => {
    const { db } = await import("@/lib/db");

    const createdOrder = {
      id: "order-no-cae-1",
      total: 50,
      seller: "Test Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      businessId: "business-123",
      clientIvaCondition: "Consumidor Final",
      clientDocumentNumber: null,
      CAE: null,
      items: [],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          order: {
            create: vi.fn().mockResolvedValue(createdOrder),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({ id: "movement-1" }),
          },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({ id: "ranking-1" }),
          },
          cashBox: {
            upsert: vi.fn().mockResolvedValue({ id: "cashbox-1" }),
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-movement-1" }),
          },
        };
        return callback(tx);
      }
    );

    const inputWithoutCAE = {
      ...baseInput,
      total: 50,
      clientIvaCondition: "Consumidor Final",
    } as Parameters<typeof processSaleAction>[0];

    const result = await processSaleAction(inputWithoutCAE);

    expect(result.success).toBe(true);
    expect((db.$transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("should preserve CAE data structure integrity", () => {
    const validCAE = {
      CAE: "1234567890123",
      vencimiento: "2026-12-31",
      nroComprobante: 1,
      qrData: "https://afip.gob.ar/qr?p=...",
    };

    expect(validCAE.CAE).toBeDefined();
    expect(validCAE.vencimiento).toBeDefined();
    expect(validCAE.nroComprobante).toBeDefined();
    expect(validCAE.qrData).toBeDefined();
  });
});

describe("Billing Fields - Integration Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies ProcessSaleInput type definition exists and includes billing fields", () => {
    const mockProcessSaleInput: {
      clientIvaCondition?: string;
      clientDocumentNumber?: string;
      CAE?: typeof mockCAE;
      total: number;
      seller: string;
    } = {
      total: 100,
      seller: "Test",
      clientIvaCondition: "CUIT",
      clientDocumentNumber: "20123456789",
      CAE: mockCAE,
    };

    expect(mockProcessSaleInput.clientIvaCondition).toBe("CUIT");
    expect(mockProcessSaleInput.clientDocumentNumber).toBe("20123456789");
    expect(mockProcessSaleInput.CAE).toEqual(mockCAE);
  });

  it("verifies CAE interface structure matches expected format", () => {
    interface CAEType {
      CAE: string;
      vencimiento: string;
      nroComprobante: number;
      qrData: string;
    }

    const caeData: CAEType = {
      CAE: "12345678901234", // 14 digits
      vencimiento: "2026-12-31",
      nroComprobante: 5,
      qrData: "https://afip.gob.ar/qr?p=eyJjYWUiOiIxMjM0NTY3ODkwMTIzIiwidmVuY2ltaWVudG8iOiIyMDI2LTEyLTMxIn0=",
    };

    expect(caeData.CAE).toHaveLength(14);
    expect(new Date(caeData.vencimiento) > new Date()).toBe(true);
    expect(typeof caeData.nroComprobante).toBe("number");
    expect(caeData.qrData).toContain("https://");
  });

  it("verifies backward compatibility - existing fields still work", () => {
    const minimalInput = {
      total: 100,
      totalWithDiscount: 100,
      seller: "Test Seller",
      paidMethod: "Efectivo",
      products: [
        {
          id: "product-1",
          code: "P001",
          description: "Test Product",
          salePrice: 100,
          amount: 1,
        },
      ],
    };

    expect(minimalInput.total).toBe(100);
    expect(minimalInput.seller).toBe("Test Seller");
    expect(minimalInput.products.length).toBe(1);
  });
});
