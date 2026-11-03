import { beforeEach, describe, expect, it, vi } from "vitest";
import { processSaleAction, updateOrderAction } from "@/actions/sales";

const batchMocks = vi.hoisted(() => ({ bulkUpdateStock: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn() },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "user-1", businessId: "business-1", role: "ADMIN" },
  }),
}));

vi.mock("@/lib/batch-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/batch-utils")>();
  return { ...actual, bulkUpdateStock: batchMocks.bulkUpdateStock };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/lib/pusher-server", () => ({
  pusherServer: { trigger: vi.fn() },
}));

const lineItems = [
  {
    id: "catalog-product-1",
    code: "SKU-1",
    description: "Variable product",
    price: 100,
    salePrice: 4000,
    amount: 2,
  },
  {
    id: "catalog-product-1",
    code: "SKU-1",
    description: "Variable product",
    price: 100,
    salePrice: 3400,
    amount: 3,
  },
];

const updateInput = {
  total: 18200,
  totalWithDiscount: 18200,
  seller: "cashier@example.com",
  paidMethod: "Efectivo",
  products: lineItems,
};

const explicitZeroPriceInput = {
  ...updateInput,
  total: 500,
  totalWithDiscount: 500,
  products: [
    {
      id: "catalog-product-1",
      code: "SKU-1",
      description: "Variable product",
      price: 125,
      salePrice: 0,
      amount: 2,
    },
    {
      id: "catalog-product-2",
      code: "SKU-2",
      description: "Regular product",
      price: 200,
      salePrice: 250,
      amount: 2,
    },
  ],
};

describe("sale stock updates for repeated variable-price catalog rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchMocks.bulkUpdateStock.mockResolvedValue(undefined);
  });

  it("persists separate sale lines and aggregates their stock decrement by catalog id", async () => {
    const { db } = await import("@/lib/db");
    const orderCreate = vi.fn().mockResolvedValue({ id: "order-1" });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      cashboxSession: {
        findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }),
      },
      order: { create: orderCreate },
      stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      cashBox: { update: vi.fn().mockResolvedValue({ id: "cashbox-1" }) },
      cashMovement: { create: vi.fn().mockResolvedValue({ id: "movement-1" }) },
    };
    vi.mocked(db.$transaction).mockImplementation(async (callback) => callback(tx as never) as never);

    const result = await processSaleAction(updateInput);

    expect(result).toEqual({ success: true, orderId: "order-1" });
    expect(orderCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: {
          create: [
            expect.objectContaining({ productId: "catalog-product-1", quantity: 2, price: 4000, subTotal: 8000 }),
            expect.objectContaining({ productId: "catalog-product-1", quantity: 3, price: 3400, subTotal: 10200 }),
          ],
        },
      }),
    }));
    expect(batchMocks.bulkUpdateStock).toHaveBeenCalledTimes(1);
    expect(batchMocks.bulkUpdateStock).toHaveBeenCalledWith(tx, [
      { id: "catalog-product-1", change: -5 },
    ]);
  });

  it("preserves an explicit zero sale price and zero subtotal when creating a sale", async () => {
    const { db } = await import("@/lib/db");
    const orderCreate = vi.fn().mockResolvedValue({ id: "order-zero-price" });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      cashboxSession: {
        findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }),
      },
      order: { create: orderCreate },
      stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      cashBox: { update: vi.fn().mockResolvedValue({ id: "cashbox-1" }) },
      cashMovement: { create: vi.fn().mockResolvedValue({ id: "movement-1" }) },
    };
    vi.mocked(db.$transaction).mockImplementation(async (callback) => callback(tx as never) as never);

    await processSaleAction(explicitZeroPriceInput);

    const createdItems = vi.mocked(orderCreate).mock.calls[0]?.[0].data.items;
    expect(createdItems).toMatchObject({
      create: [
        { productId: "catalog-product-1", costPrice: 125, price: 0, quantity: 2, subTotal: 0 },
        { productId: "catalog-product-2", costPrice: 200, price: 250, quantity: 2, subTotal: 500 },
      ],
    });
  });

  it("aggregates both the old-row stock restoration and replacement-row decrement on sale update", async () => {
    const { db } = await import("@/lib/db");
    const orderUpdate = vi.fn().mockResolvedValue({ id: "order-1" });
    const orderUpdateCreate = vi.fn().mockResolvedValue({ id: "update-1" });
    const oldItems = [
      { id: "old-line-1", productId: "catalog-product-1", quantity: 1, price: 1000, subTotal: 1000, code: "SKU-1", description: "Variable product" },
      { id: "old-line-2", productId: "catalog-product-1", quantity: 4, price: 2000, subTotal: 8000, code: "SKU-1", description: "Variable product" },
    ];
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: "order-1",
          total: 9000,
          status: "confirmado",
          paidStatus: "pago",
          discountAmount: 0,
          discountPercentage: 0,
          clientId: null,
          items: oldItems,
        }),
        update: orderUpdate,
      },
      orderUpdate: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: orderUpdateCreate,
      },
      stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    vi.mocked(db.$transaction).mockImplementation(async (callback) => callback(tx as never) as never);

    const result = await updateOrderAction("order-1", updateInput);

    expect(result).toEqual({ success: true });
    expect(batchMocks.bulkUpdateStock).toHaveBeenCalledTimes(2);
    expect(batchMocks.bulkUpdateStock).toHaveBeenNthCalledWith(1, tx, [
      { id: "catalog-product-1", change: 5 },
    ]);
    expect(batchMocks.bulkUpdateStock).toHaveBeenNthCalledWith(2, tx, [
      { id: "catalog-product-1", change: -5 },
    ]);
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: expect.objectContaining({
          create: [
            expect.objectContaining({ productId: "catalog-product-1", quantity: 2, price: 4000 }),
            expect.objectContaining({ productId: "catalog-product-1", quantity: 3, price: 3400 }),
          ],
        }),
      }),
    }));
    expect(orderUpdateCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        changes: {
          type: "ITEMS_UPDATED",
          items: [
            expect.objectContaining({
              productId: "catalog-product-1",
              quantity: { from: 1, to: 2 },
            }),
            expect.objectContaining({
              productId: "catalog-product-1",
              quantity: { from: 4, to: 3 },
            }),
          ],
        },
      }),
    }));
  });

  it("preserves an explicit zero sale price and zero subtotal when updating a sale", async () => {
    const { db } = await import("@/lib/db");
    const orderUpdate = vi.fn().mockResolvedValue({ id: "order-1" });
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: "order-1",
          total: 0,
          status: "confirmado",
          paidStatus: "pago",
          discountAmount: 0,
          discountPercentage: 0,
          clientId: null,
          items: [],
        }),
        update: orderUpdate,
      },
      orderUpdate: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "update-1" }),
      },
      stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    vi.mocked(db.$transaction).mockImplementation(async (callback) => callback(tx as never) as never);

    await updateOrderAction("order-1", explicitZeroPriceInput);

    const updatedItems = vi.mocked(orderUpdate).mock.calls[0]?.[0].data.items;
    expect(updatedItems).toMatchObject({
      create: [
        { productId: "catalog-product-1", costPrice: 125, price: 0, quantity: 2, subTotal: 0 },
        { productId: "catalog-product-2", costPrice: 200, price: 250, quantity: 2, subTotal: 500 },
      ],
    });
  });
});
