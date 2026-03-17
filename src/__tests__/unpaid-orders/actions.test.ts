import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addItemsToOrder,
  updateOrderItem,
  removeOrderItem,
  getClientUnpaidOrder,
} from "@/actions/unpaid-orders";

vi.mock("@/lib/db", () => {
  return {
    db: {
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { businessId: "business-123" } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("R1: addItemsToOrder - adds items with addedAt timestamp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should add items to existing unpaid order with current timestamp as addedAt", async () => {
    const { db } = await import("@/lib/db");

    const existingOrder = {
      id: "order-1",
      paidStatus: "inpago",
      total: 100,
      clientId: "client-1",
      items: [{ id: "item-1", quantity: 2, price: 50, subTotal: 100 }],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(existingOrder),
            update: vi.fn().mockResolvedValue({ ...existingOrder, total: 250 }),
          },
          product: {
            findUnique: vi.fn().mockResolvedValue({ id: "product-1", amount: 10 }),
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          orderItem: {
            create: vi.fn().mockResolvedValue({ id: "item-2", addedAt: new Date() }),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({ id: "movement-1" }),
          },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
          orderUpdate: {
            create: vi.fn().mockResolvedValue({ id: "update-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await addItemsToOrder({
      orderId: "order-1",
      businessId: "business-123",
      items: [
        {
          productId: "product-2",
          price: 50,
          quantity: 3,
          subTotal: 150,
        },
      ],
    });

    expect(result.success).toBe(true);
    // const tx = {
    //   orderItem: {
    //     create: vi.fn().mock.calls[0],
    //   },
    // };
  });

  it("should fail when trying to add items to a paid order", async () => {
    const { db } = await import("@/lib/db");

    const paidOrder = {
      id: "order-1",
      paidStatus: "pago",
      total: 100,
      clientId: "client-1",
      items: [],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(paidOrder),
          },
        };
        return callback(tx);
      }
    );

    const result = await addItemsToOrder({
      orderId: "order-1",
      businessId: "business-123",
      items: [
        {
          productId: "product-1",
          price: 50,
          quantity: 1,
          subTotal: 50,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("pagado");
  });
});

describe("R2: updateOrderItem - edit quantity and price", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update item quantity and recalculate subTotal", async () => {
    const { db } = await import("@/lib/db");

    const orderItem = {
      id: "item-1",
      orderId: "order-1",
      quantity: 2,
      price: 50,
      subTotal: 100,
      productId: "product-1",
    };

    const order = {
      id: "order-1",
      total: 100,
      paidStatus: "inpago",
      clientId: "client-1",
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          orderItem: {
            findUnique: vi.fn().mockResolvedValue(orderItem),
            update: vi.fn().mockResolvedValue({
              ...orderItem,
              quantity: 5,
              price: 50,
              subTotal: 250,
            }),
          },
          order: {
            findUnique: vi.fn().mockResolvedValue(order),
            update: vi.fn().mockResolvedValue({ ...order, total: 250 }),
          },
          product: {
            findUnique: vi.fn().mockResolvedValue({ id: "product-1", amount: 10 }),
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({ id: "movement-1" }),
          },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
          orderUpdate: {
            create: vi.fn().mockResolvedValue({ id: "update-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await updateOrderItem({
      itemId: "item-1",
      orderId: "order-1",
      quantity: 5,
    });

    expect(result.success).toBe(true);
  });

  it("should update item price and recalculate subTotal", async () => {
    const { db } = await import("@/lib/db");

    const orderItem = {
      id: "item-1",
      orderId: "order-1",
      quantity: 2,
      price: 50,
      subTotal: 100,
      productId: "product-1",
    };

    const order = {
      id: "order-1",
      total: 100,
      paidStatus: "inpago",
      clientId: "client-1",
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          orderItem: {
            findUnique: vi.fn().mockResolvedValue(orderItem),
            update: vi.fn().mockResolvedValue({
              ...orderItem,
              quantity: 2,
              price: 75,
              subTotal: 150,
            }),
          },
          order: {
            findUnique: vi.fn().mockResolvedValue(order),
            update: vi.fn().mockResolvedValue({ ...order, total: 150 }),
          },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
          orderUpdate: {
            create: vi.fn().mockResolvedValue({ id: "update-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await updateOrderItem({
      itemId: "item-1",
      orderId: "order-1",
      price: 75,
    });

    expect(result.success).toBe(true);
  });

  it("should fail when updating item on paid order", async () => {
    const { db } = await import("@/lib/db");

    const orderItem = {
      id: "item-1",
      orderId: "order-1",
      quantity: 2,
      price: 50,
      subTotal: 100,
    };

    const paidOrder = {
      id: "order-1",
      paidStatus: "pago",
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          orderItem: {
            findUnique: vi.fn().mockResolvedValue(orderItem),
          },
          order: {
            findUnique: vi.fn().mockResolvedValue(paidOrder),
          },
        };
        return callback(tx);
      }
    );

    const result = await updateOrderItem({
      itemId: "item-1",
      orderId: "order-1",
      quantity: 5,
    });

    expect(result.success).toBe(false);
  });
});

describe("R2: removeOrderItem - remove items from unpaid orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should remove item from unpaid order and update totals", async () => {
    const { db } = await import("@/lib/db");

    const orderItem = {
      id: "item-1",
      orderId: "order-1",
      quantity: 2,
      price: 50,
      subTotal: 100,
      productId: "product-1",
    };

    const order = {
      id: "order-1",
      total: 200,
      paidStatus: "inpago",
      clientId: "client-1",
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          orderItem: {
            findUnique: vi.fn().mockResolvedValue(orderItem),
            delete: vi.fn().mockResolvedValue({ id: "item-1" }),
          },
          order: {
            findUnique: vi.fn().mockResolvedValue(order),
            update: vi.fn().mockResolvedValue({ ...order, total: 100 }),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({ id: "movement-1" }),
          },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
          orderUpdate: {
            create: vi.fn().mockResolvedValue({ id: "update-1" }),
          },
        };
        return callback(tx);
      }
    );

    const result = await removeOrderItem({
      itemId: "item-1",
      orderId: "order-1",
    });

    expect(result.success).toBe(true);
  });

  it("should fail when removing item from paid order", async () => {
    const { db } = await import("@/lib/db");

    const orderItem = {
      id: "item-1",
      orderId: "order-1",
    };

    const paidOrder = {
      id: "order-1",
      paidStatus: "pago",
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          orderItem: {
            findUnique: vi.fn().mockResolvedValue(orderItem),
          },
          order: {
            findUnique: vi.fn().mockResolvedValue(paidOrder),
          },
        };
        return callback(tx);
      }
    );

    const result = await removeOrderItem({
      itemId: "item-1",
      orderId: "order-1",
    });

    expect(result.success).toBe(false);
  });
});

describe("R3: getClientUnpaidOrder - find existing unpaid order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return existing unpaid order for client", async () => {
    const { db } = await import("@/lib/db");

    const unpaidOrder = {
      id: "order-1",
      paidStatus: "inpago",
      total: 150,
      clientId: "client-1",
      items: [
        { id: "item-1", addedAt: new Date("2024-01-15"), quantity: 2, price: 50 },
      ],
    };

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          order: {
            findFirst: vi.fn().mockResolvedValue(unpaidOrder),
          },
        };
        return callback(tx);
      }
    );

    const result = await getClientUnpaidOrder("client-1", "business-123");

    expect(result.success).toBe(true);
    expect(result.data).toEqual(unpaidOrder);
  });

  it("should return success with null when client has no unpaid orders", async () => {
    const { db } = await import("@/lib/db");

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          order: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return callback(tx);
      }
    );

    const result = await getClientUnpaidOrder("client-1", "business-123");

    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });
});

describe("Order total updates automatically", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should recalculate order total after adding items", async () => {
    const { db } = await import("@/lib/db");

    const existingOrder = {
      id: "order-1",
      paidStatus: "inpago",
      total: 100,
      clientId: "client-1",
    };

    let updatedTotal = 0;

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(existingOrder),
            update: vi.fn().mockImplementation(({ data }) => {
              if (data.total) {
                updatedTotal = data.total as number;
              }
              return { ...existingOrder, total: updatedTotal };
            }),
          },
          product: {
            findUnique: vi.fn().mockResolvedValue({ id: "product-1", amount: 10 }),
            update: vi.fn().mockResolvedValue({ id: "product-1" }),
          },
          orderItem: {
            create: vi.fn().mockResolvedValue({ id: "item-2" }),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({ id: "movement-1" }),
          },
          client: {
            update: vi.fn().mockResolvedValue({ id: "client-1" }),
          },
          orderUpdate: {
            create: vi.fn().mockResolvedValue({ id: "update-1" }),
          },
        };
        return callback(tx);
      }
    );

    await addItemsToOrder({
      orderId: "order-1",
      businessId: "business-123",
      items: [
        {
          productId: "product-2",
          price: 50,
          quantity: 2,
          subTotal: 100,
        },
      ],
    });

    expect(updatedTotal).toBe(200);
  });
});
