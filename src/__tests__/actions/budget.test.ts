import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBudgetAction } from "@/actions/budget";

vi.mock("@/lib/db", () => ({
  db: {
    order: {
      create: vi.fn().mockResolvedValue({ id: "budget-order-1" }),
    },
    stockMovement: {
      create: vi.fn(),
    },
    cashMovement: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-123" } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/pusher-server", () => ({
  pusherServer: {
    trigger: vi.fn().mockResolvedValue({}),
  },
}));

const baseInput = {
  products: [
    {
      id: "product-1",
      code: "P001",
      description: "Test Product",
      salePrice: 100,
      amount: 2,
    },
  ],
  total: 200,
  totalWithDiscount: 200,
  seller: "Test Seller",
  discount: 0,
};

describe("createBudgetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export a named function createBudgetAction", () => {
    expect(createBudgetAction).toBeDefined();
    expect(typeof createBudgetAction).toBe("function");
  });

  it("should call db.order.create with status 'pendiente' and paidStatus 'inpago'", async () => {
    const { db } = await import("@/lib/db");

    await createBudgetAction(baseInput);

    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pendiente",
          paidStatus: "inpago",
        }),
      }),
    );
  });

  it("should pass businessId from auth session", async () => {
    const { db } = await import("@/lib/db");

    await createBudgetAction(baseInput);

    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "business-123",
        }),
      }),
    );
  });

  it("should include order items in the create call", async () => {
    const { db } = await import("@/lib/db");

    await createBudgetAction(baseInput);

    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                productId: "product-1",
                amount: 2,
                unitPrice: 100,
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it("should NOT call db.stockMovement.create", async () => {
    const { db } = await import("@/lib/db");

    await createBudgetAction(baseInput);

    expect(db.stockMovement.create).not.toHaveBeenCalled();
  });

  it("should NOT call db.cashMovement.create", async () => {
    const { db } = await import("@/lib/db");

    await createBudgetAction(baseInput);

    expect(db.cashMovement.create).not.toHaveBeenCalled();
  });

  it("should trigger pusher after creating the budget", async () => {
    const { pusherServer } = await import("@/lib/pusher-server");

    await createBudgetAction(baseInput);

    expect(pusherServer.trigger).toHaveBeenCalled();
  });

  it("should trigger revalidation after creating the budget", async () => {
    const { revalidatePath } = await import("next/cache");

    await createBudgetAction(baseInput);

    expect(revalidatePath).toHaveBeenCalled();
  });

  it("should return the created order on success", async () => {
    const { db } = await import("@/lib/db");
    (db.order.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "budget-order-1",
      status: "pendiente",
      paidStatus: "inpago",
    });

    const result = await createBudgetAction(baseInput);

    expect(result).toEqual(
      expect.objectContaining({
        id: "budget-order-1",
      }),
    );
  });

  it("should accept input without a client (client is optional)", async () => {
    const { db } = await import("@/lib/db");

    await createBudgetAction(baseInput);

    const createCall = (db.order.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.clientId).toBeUndefined();
  });

  it("should accept input with a clientId", async () => {
    const { db } = await import("@/lib/db");

    const inputWithClient = { ...baseInput, clientId: "client-1" };
    await createBudgetAction(inputWithClient);

    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: "client-1",
        }),
      }),
    );
  });
});
