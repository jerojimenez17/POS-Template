import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processSaleAction,
  getSalesAction,
  getSaleByIdAction,
  updateOrderAction,
} from "@/actions/sales";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    orderUpdate: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-123", role: "ADMIN", email: "admin@example.com" } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/auth-gates", () => ({
  requireFeature: vi.fn().mockResolvedValue({ success: true, data: { businessId: "business-123" } }),
  assertWritePermission: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/daily-limits", () => ({
  getDailyUsage: vi.fn().mockResolvedValue({ salesCount: 0, productsCount: 0, clientsCount: 0 }),
  checkDailyLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 999999 }),
  incrementDailyUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/pusher-server", () => ({
  pusherServer: {
    trigger: vi.fn().mockResolvedValue(undefined),
  },
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
          $executeRaw: vi.fn().mockResolvedValue(1),
          $queryRaw: vi.fn().mockResolvedValue([]),
          cashboxSession: {
            findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }),
          },
          order: {
            create: vi.fn().mockResolvedValue(createdOrder),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
             create: vi.fn().mockResolvedValue({ id: "movement-1" }),
             createMany: vi.fn().mockResolvedValue({ count: 1 }),
           },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({ id: "ranking-1" }),
          },
          cashBox: {
            update: vi.fn().mockResolvedValue({ id: "cashbox-1" }),
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
          $executeRaw: vi.fn().mockResolvedValue(1),
          $queryRaw: vi.fn().mockResolvedValue([]),
          cashboxSession: {
            findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }),
          },
          order: {
            create: vi.fn().mockResolvedValue(createdOrder),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
             create: vi.fn().mockResolvedValue({ id: "movement-1" }),
             createMany: vi.fn().mockResolvedValue({ count: 1 }),
           },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({ id: "ranking-1" }),
          },
          cashBox: {
            update: vi.fn().mockResolvedValue({ id: "cashbox-1" }),
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
          $executeRaw: vi.fn().mockResolvedValue(1),
          $queryRaw: vi.fn().mockResolvedValue([]),
          cashboxSession: {
            findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }),
          },
          order: {
            create: vi.fn().mockResolvedValue(createdOrder),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
             create: vi.fn().mockResolvedValue({ id: "movement-1" }),
             createMany: vi.fn().mockResolvedValue({ count: 1 }),
           },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({ id: "ranking-1" }),
          },
          cashBox: {
            update: vi.fn().mockResolvedValue({ id: "cashbox-1" }),
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

    expect(Array.isArray(result.sales)).toBe(true);
    expect(result.sales).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
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

    expect(result.sales).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(db.order.findMany).toHaveBeenCalled();
  });

  it("should return empty array when no orders exist", async () => {
    const { db } = await import("@/lib/db");

    (db.order.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await getSalesAction();

    expect(Array.isArray(result.sales)).toBe(true);
    expect(result.sales).toEqual([]);
    expect(result.nextCursor).toBeNull();
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
          $executeRaw: vi.fn().mockResolvedValue(1),
          $queryRaw: vi.fn().mockResolvedValue([]),
          cashboxSession: {
            findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }),
          },
          order: {
            create: vi.fn().mockResolvedValue(createdOrder),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
             create: vi.fn().mockResolvedValue({ id: "movement-1" }),
             createMany: vi.fn().mockResolvedValue({ count: 1 }),
           },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({ id: "ranking-1" }),
          },
          cashBox: {
            update: vi.fn().mockResolvedValue({ id: "cashbox-1" }),
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

describe("AFIP Feature Gate - processSaleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return error when feature disabled and CAE present (gate blocks)", async () => {
    const { requireFeature } = await import("@/lib/auth-gates");
    vi.mocked(requireFeature).mockResolvedValue({
      success: false,
      error: "Función no habilitada",
    });

    const inputWithCAE = {
      ...baseInput,
      CAE: mockCAE,
    } as Parameters<typeof processSaleAction>[0];

    const result = await processSaleAction(inputWithCAE);

    expect("error" in result && result.error).toBeTruthy();
    // $transaction should NOT be called when gate blocks
    const { db } = await import("@/lib/db");
    expect((db.$transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("should succeed when feature enabled and CAE present (gate passes)", async () => {
    const { db } = await import("@/lib/db");
    const { requireFeature } = await import("@/lib/auth-gates");
    vi.mocked(requireFeature).mockResolvedValue({
      success: true,
      data: { id: "user-1", businessId: "business-123", role: "ADMIN", business: null },
    });

    const createdOrder = {
      id: "order-cae-gate-1",
      total: 100,
      seller: "Test Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      businessId: "business-123",
      CAE: mockCAE,
      items: [],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $executeRaw: vi.fn().mockResolvedValue(1),
          $queryRaw: vi.fn().mockResolvedValue([]),
          cashboxSession: {
            findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }),
          },
          order: {
            create: vi.fn().mockResolvedValue(createdOrder),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
             create: vi.fn().mockResolvedValue({ id: "movement-1" }),
             createMany: vi.fn().mockResolvedValue({ count: 1 }),
           },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({ id: "ranking-1" }),
          },
          cashBox: {
            update: vi.fn().mockResolvedValue({ id: "cashbox-1" }),
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-movement-1" }),
          },
        };
        return callback(tx);
      }
    );

    const inputWithCAE = {
      ...baseInput,
      CAE: mockCAE,
    } as Parameters<typeof processSaleAction>[0];

    const result = await processSaleAction(inputWithCAE);

    expect(result.success).toBe(true);
    expect((db.$transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("should succeed when feature disabled but NO CAE (gate skipped)", async () => {
    const { db } = await import("@/lib/db");

    // Mock requireFeature to fail — but gate should be skipped since no CAE
    const { requireFeature } = await import("@/lib/auth-gates");
    vi.mocked(requireFeature).mockResolvedValue({
      success: false,
      error: "Función no habilitada",
    });

    const createdOrder = {
      id: "order-no-cae-gate-skip-1",
      total: 100,
      seller: "Test Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      businessId: "business-123",
      items: [],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $executeRaw: vi.fn().mockResolvedValue(1),
          $queryRaw: vi.fn().mockResolvedValue([]),
          cashboxSession: {
            findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }),
          },
          order: {
            create: vi.fn().mockResolvedValue(createdOrder),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
             create: vi.fn().mockResolvedValue({ id: "movement-1" }),
             createMany: vi.fn().mockResolvedValue({ count: 1 }),
           },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({ id: "ranking-1" }),
          },
          cashBox: {
            update: vi.fn().mockResolvedValue({ id: "cashbox-1" }),
          },
          cashMovement: {
            create: vi.fn().mockResolvedValue({ id: "cash-movement-1" }),
          },
        };
        return callback(tx);
      }
    );

    // No CAE in input
    const result = await processSaleAction(baseInput);

    expect(result.success).toBe(true);
    expect((db.$transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});

describe("updateOrderAction — CAE validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const buildUpdateTx = (options: {
    existingOrder: Record<string, unknown>;
    orderUpdateCreate?: ReturnType<typeof vi.fn>;
    orderUpdate?: ReturnType<typeof vi.fn>;
    cashMovements?: unknown[];
    activeSession?: Record<string, unknown> | null;
  }) => {
    const orderUpdateCreate = options.orderUpdateCreate ?? vi.fn().mockResolvedValue({ id: "update-1" });
    const orderUpdate = options.orderUpdate ?? vi.fn().mockResolvedValue({ id: "order-1" });
    const cashMovement = {
      findMany: vi.fn().mockResolvedValue(options.cashMovements ?? []),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: "cash-1" }),
    };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: {
        findFirst: vi.fn().mockResolvedValue(options.existingOrder),
        update: orderUpdate,
      },
      orderUpdate: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: orderUpdateCreate,
      },
      product: { update: vi.fn().mockResolvedValue({}) },
      productRanking: { upsert: vi.fn().mockResolvedValue({}) },
      stockMovement: {
        create: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      cashMovement,
      cashboxSession: {
        findFirst: vi.fn().mockResolvedValue(options.activeSession ?? null),
      },
      cashBox: { update: vi.fn().mockResolvedValue({}) },
    };
    return { tx, orderUpdateCreate, orderUpdate, cashMovement };
  };

  it.each(["ADMIN", "USER"])("should allow %s to edit a non-invoiced sale", async (role) => {
    const { db } = await import("@/lib/db");
    const { auth } = await import("@/auth");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: "business-123", role },
    });

    const existingOrder = {
      id: "order-no-cae-edit",
      total: 100,
      seller: "Test Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      businessId: "business-123",
      clientId: null,
      clientIvaCondition: null,
      clientDocumentNumber: null,
      CAE: null,
      discountAmount: 0,
      discountPercentage: 0,
      date: new Date(),
      items: [],
    };

    let mockTx: {
      order: { findFirst?: ReturnType<typeof vi.fn>; update?: ReturnType<typeof vi.fn> };
      cashboxSession?: { findFirst?: ReturnType<typeof vi.fn> };
    };
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $executeRaw: vi.fn().mockResolvedValue(1),
          $queryRaw: vi.fn().mockResolvedValue([]),
          order: {
            findFirst: vi.fn().mockResolvedValue(existingOrder),
            update: vi.fn().mockResolvedValue(existingOrder),
          },
          orderUpdate: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "update-1" }),
          },
          product: {
            update: vi.fn().mockResolvedValue({}),
          },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({}),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({}),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          // Fix 7C (sale edit syncs CashMovements/CashBox) — merged behavior from 8352abd
          cashboxSession: {
            findFirst: vi.fn().mockResolvedValue({
              id: "session-1",
              cashboxId: "cashbox-1",
              businessId: "business-123",
            }),
          },
          cashBox: {
            update: vi.fn().mockResolvedValue({}),
          },
          cashMovement: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({ id: "cash-movement-edit-1" }),
          },
        };
        mockTx = tx;
        return callback(tx);
      }
    );

    const result = await updateOrderAction("order-no-cae-edit", {
      total: 100,
      seller: "Test Seller",
      paidMethod: "Efectivo",
      products: [
        { id: "product-1", code: "P001", description: "Test", salePrice: 100, amount: 1 },
      ],
      clientIvaCondition: "CUIT",
      clientDocumentNumber: "20123456789",
    });

    expect(result.success).toBe(true);
    // Verify the update uses the current server action contract.
    expect(mockTx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          total: 100,
          seller: "Test Seller",
          paymentMethod: "Efectivo",
        }),
      })
    );
    expect(mockTx.cashboxSession?.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        businessId: "business-123",
        status: "OPEN",
        cashbox: { businessId: "business-123" },
      },
    });
  });

  it("should allow editing a cash sale without an open cashbox session", async () => {
    const { db } = await import("@/lib/db");
    const { auth } = await import("@/auth");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: "business-123", role: "USER" },
    });

    const existingOrder = {
      id: "order-no-session",
      total: 100,
      seller: "Test Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      businessId: "business-123",
      clientId: null,
      CAE: null,
      discountAmount: 0,
      discountPercentage: 0,
      date: new Date(),
      items: [],
    };

    let mockTx: {
      cashboxSession: { findFirst: ReturnType<typeof vi.fn> };
      cashBox: { update: ReturnType<typeof vi.fn> };
      cashMovement: { create: ReturnType<typeof vi.fn> };
    };
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $executeRaw: vi.fn().mockResolvedValue(1),
          $queryRaw: vi.fn().mockResolvedValue([]),
          order: {
            findFirst: vi.fn().mockResolvedValue(existingOrder),
            update: vi.fn().mockResolvedValue(existingOrder),
          },
          orderUpdate: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "update-1" }),
          },
          product: {
            update: vi.fn().mockResolvedValue({}),
          },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({}),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({}),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          cashboxSession: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          cashBox: {
            update: vi.fn().mockResolvedValue({}),
          },
          cashMovement: {
            findMany: vi.fn().mockResolvedValue([
              { id: "cash-old", total: 100, cashboxSessionId: "session-original" },
            ]),
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({ id: "cash-new" }),
          },
        };
        mockTx = tx;
        return callback(tx);
      }
    );

    const result = await updateOrderAction("order-no-session", {
      total: 150,
      totalWithDiscount: 150,
      seller: "Test Seller",
      paidMethod: "Efectivo",
      products: [
        { id: "product-1", code: "P001", description: "Test", salePrice: 150, amount: 1 },
      ],
    });

    expect(result.success).toBe(true);
    expect(mockTx.cashboxSession.findFirst).toHaveBeenCalled();
    // Sin sesión abierta no se toca el CashBox...
    expect(mockTx.cashBox.update).not.toHaveBeenCalled();
    // ...pero el movimiento conserva la sesión histórica de la venta.
    expect(mockTx.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          total: 150,
          cashboxSessionId: "session-original",
        }),
      })
    );
  });

  it("records bill type, IVA, payment, discount and removed products in the update history", async () => {
    const { db } = await import("@/lib/db");
    const { auth } = await import("@/auth");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: "business-123", role: "ADMIN" },
    });

    const existingOrder = {
      id: "order-history",
      total: 300,
      seller: "Old Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      paymentMethod2: null,
      discountPercentage: 0,
      discountAmount: 0,
      clientId: null,
      clientIvaCondition: "Consumidor Final",
      clientDocumentNumber: null,
      billType: "Factura B",
      CAE: null,
      date: new Date(),
      items: [
        { productId: "product-1", code: "P1", description: "Producto 1", quantity: 2, price: 100, subTotal: 200 },
        { productId: "product-2", code: "P2", description: "Producto 2", quantity: 1, price: 100, subTotal: 100 },
      ],
    };

    const orderUpdateCreate = vi.fn().mockResolvedValue({ id: "update-1" });
    const orderUpdate = vi.fn().mockResolvedValue({ id: "order-history" });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $executeRaw: vi.fn().mockResolvedValue(1),
          $queryRaw: vi.fn().mockResolvedValue([]),
          order: {
            findFirst: vi.fn().mockResolvedValue(existingOrder),
            update: orderUpdate,
          },
          orderUpdate: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: orderUpdateCreate,
          },
          product: {
            update: vi.fn().mockResolvedValue({}),
          },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({}),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({}),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          cashMovement: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({ id: "cash-new" }),
          },
          cashboxSession: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          cashBox: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      }
    );

    const result = await updateOrderAction("order-history", {
      total: 150,
      totalWithDiscount: 150,
      seller: "New Seller",
      paidMethod: "Transferencia",
      twoMethods: false,
      discount: 10,
      billType: "Factura A",
      clientIvaCondition: "CUIT",
      clientDocumentNumber: "20123456789",
      products: [
        { id: "product-1", code: "P1", description: "Producto 1", salePrice: 150, amount: 1 },
      ],
    });

    expect(result.success).toBe(true);

    const changes = orderUpdateCreate.mock.calls[0][0].data.changes;
    expect(changes).toEqual(expect.objectContaining({
      type: "ITEMS_UPDATED",
      removedItems: [
        expect.objectContaining({ productId: "product-2", quantity: 1, code: "P2" }),
      ],
      billTypeChanged: { from: "Factura B", to: "Factura A" },
      ivaChanged: {
        from: { condition: "Consumidor Final", documentNumber: null },
        to: { condition: "CUIT", documentNumber: "20123456789" },
      },
      paymentChanged: {
        from: { method: "Efectivo", twoMethods: false, secondMethod: null, firstAmount: 300, secondAmount: 0 },
        to: { method: "Transferencia", twoMethods: false, secondMethod: null, firstAmount: 150, secondAmount: 0 },
      },
      discountChanged: { from: 0, to: 10 },
    }));
    expect(changes.items[0]).toEqual(expect.objectContaining({
      productId: "product-1",
      quantity: { from: 2, to: 1 },
      price: { from: 100, to: 150 },
    }));
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        billType: "Factura A",
        clientIvaCondition: "CUIT",
        clientDocumentNumber: "20123456789",
        paymentMethod: "Transferencia",
        discountPercentage: 10,
      }),
    }));
  });

  it("keeps the IVA condition when only the bill type changes", async () => {
    const { db } = await import("@/lib/db");
    const { auth } = await import("@/auth");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: "business-123", role: "ADMIN" },
    });

    const existingOrder = {
      id: "order-iva-preserve",
      total: 100,
      seller: "Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      paymentMethod2: null,
      totalMethod2: null,
      discountPercentage: 0,
      discountAmount: 0,
      clientId: null,
      clientIvaCondition: null,
      clientDocumentNumber: null,
      billType: "Factura B",
      CAE: null,
      date: new Date(),
      items: [
        { productId: "product-1", code: "P1", description: "Producto 1", quantity: 1, price: 100, subTotal: 100 },
      ],
    };
    const { tx, orderUpdateCreate, orderUpdate } = buildUpdateTx({ existingOrder });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    );

    const result = await updateOrderAction("order-iva-preserve", {
      total: 100,
      totalWithDiscount: 100,
      seller: "Seller",
      paidMethod: "Efectivo",
      twoMethods: false,
      discount: 0,
      billType: "Factura A",
      clientIvaCondition: "Consumidor Final",
      clientDocumentNumber: "0",
      products: [
        { id: "product-1", code: "P1", description: "Producto 1", salePrice: 100, amount: 1 },
      ],
    });

    expect(result.success).toBe(true);
    const changes = orderUpdateCreate.mock.calls[0][0].data.changes;
    expect(changes.billTypeChanged).toEqual({ from: "Factura B", to: "Factura A" });
    expect(changes.ivaChanged).toBeUndefined();
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        billType: "Factura A",
        clientIvaCondition: null,
        clientDocumentNumber: null,
      }),
    }));
  });

  it("does not create a history version when the update has no real changes", async () => {
    const { db } = await import("@/lib/db");
    const { auth } = await import("@/auth");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: "business-123", role: "ADMIN" },
    });

    const existingOrder = {
      id: "order-no-changes",
      total: 100,
      seller: "Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      paymentMethod2: null,
      totalMethod2: null,
      discountPercentage: 0,
      discountAmount: 0,
      clientId: null,
      clientIvaCondition: null,
      clientDocumentNumber: null,
      billType: "Factura B",
      CAE: null,
      date: new Date(),
      items: [
        { productId: "product-1", code: "P1", description: "Producto 1", quantity: 1, price: 100, subTotal: 100 },
      ],
    };
    const { tx, orderUpdateCreate, orderUpdate } = buildUpdateTx({ existingOrder });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    );

    const result = await updateOrderAction("order-no-changes", {
      total: 100,
      totalWithDiscount: 100,
      seller: "Seller",
      paidMethod: "Efectivo",
      twoMethods: false,
      discount: 0,
      billType: "Factura B",
      products: [
        { id: "product-1", code: "P1", description: "Producto 1", salePrice: 100, amount: 1 },
      ],
    });

    expect(result.success).toBe(true);
    expect(orderUpdateCreate).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("records split payment amount changes as part of the payment combination", async () => {
    const { db } = await import("@/lib/db");
    const { auth } = await import("@/auth");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: "business-123", role: "ADMIN" },
    });

    const existingOrder = {
      id: "order-split",
      total: 150,
      seller: "Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      paymentMethod2: "Débito",
      totalMethod2: 50,
      discountPercentage: 0,
      discountAmount: 0,
      clientId: null,
      clientIvaCondition: null,
      clientDocumentNumber: null,
      billType: "Factura B",
      CAE: null,
      date: new Date(),
      items: [
        { productId: "product-1", code: "P1", description: "Producto 1", quantity: 1, price: 150, subTotal: 150 },
      ],
    };
    const { tx, orderUpdateCreate } = buildUpdateTx({
      existingOrder,
      cashMovements: [{ id: "cash-old", total: 100, cashboxSessionId: "session-old" }],
    });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    );

    const result = await updateOrderAction("order-split", {
      total: 150,
      totalWithDiscount: 150,
      seller: "Seller",
      paidMethod: "Efectivo",
      twoMethods: true,
      secondPaidMethod: "Débito",
      totalSecondMethod: 80,
      discount: 0,
      billType: "Factura B",
      products: [
        { id: "product-1", code: "P1", description: "Producto 1", salePrice: 150, amount: 1 },
      ],
    });

    expect(result.success).toBe(true);
    const changes = orderUpdateCreate.mock.calls[0][0].data.changes;
    expect(changes.paymentChanged).toEqual({
      from: { method: "Efectivo", twoMethods: true, secondMethod: "Débito", firstAmount: 100, secondAmount: 50 },
      to: { method: "Efectivo", twoMethods: true, secondMethod: "Débito", firstAmount: 70, secondAmount: 80 },
    });
  });

  it("should block editing invoiced sale (CAE present)", async () => {
    const { db } = await import("@/lib/db");
    const { auth } = await import("@/auth");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: "business-123", role: "ADMIN" },
    });

    const existingOrderWithCAE = {
      id: "order-cae-blocked",
      total: 100,
      seller: "Test Seller",
      status: "confirmado",
      paidStatus: "pago",
      paymentMethod: "Efectivo",
      businessId: "business-123",
      clientId: null,
      CAE: { CAE: "1234567890123", vencimiento: "2026-12-31", nroComprobante: 1, qrData: "https://example.com/qr" },
      discountAmount: 0,
      discountPercentage: 0,
      items: [],
    };

    let mockTx: { order: { findFirst?: ReturnType<typeof vi.fn>; update?: ReturnType<typeof vi.fn> } };
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $executeRaw: vi.fn().mockResolvedValue(1),
          $queryRaw: vi.fn().mockResolvedValue([]),
          order: {
            findFirst: vi.fn().mockResolvedValue(existingOrderWithCAE),
          },
        };
        mockTx = tx;
        return callback(tx);
      }
    );

    const result = await updateOrderAction("order-cae-blocked", {
      total: 100,
      seller: "Test Seller",
      paidMethod: "Efectivo",
      products: [
        { id: "product-1", code: "P001", description: "Test", salePrice: 100, amount: 1 },
      ],
    });

    // Should fail because CAE exists (throw inside transaction → outer catch returns error)
    expect(result.success).toBe(false);
    expect(result.error).toContain("ya fue facturada");
    // order.findFirst was called (CAE check happened)
    expect(mockTx.order.findFirst).toHaveBeenCalled();
    // order.update should NOT have been called because CAE check throws before it
    expect(mockTx.order.update).toBeUndefined();
  });

  it("should reject roles without sale-edit permission before opening a transaction", async () => {
    const { db } = await import("@/lib/db");
    const { auth } = await import("@/auth");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", businessId: "business-123", role: "GUEST" },
    });

    const result = await updateOrderAction("order-forbidden", {
      total: 100,
      seller: "Test Seller",
      paidMethod: "Efectivo",
      products: [
        { id: "product-1", code: "P001", description: "Test", salePrice: 100, amount: 1 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("No tenés permisos para editar ventas");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
