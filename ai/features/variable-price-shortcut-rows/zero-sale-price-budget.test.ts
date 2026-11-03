import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBudgetAction } from "@/actions/budget";

vi.mock("@/lib/db", () => ({
  db: {
    order: {
      create: vi.fn().mockResolvedValue({ id: "budget-zero-price" }),
    },
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "cashier-1", businessId: "business-1" } }),
}));

vi.mock("@/lib/pusher-server", () => ({
  pusherServer: { trigger: vi.fn().mockResolvedValue({}) },
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

describe("budget sale-price fidelity for variable-price rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists explicit zero salePrice and zero subtotal despite nonzero catalog cost", async () => {
    const { db } = await import("@/lib/db");

    const result = await createBudgetAction({
      total: 0,
      totalWithDiscount: 0,
      seller: "cashier@example.com",
      products: [{
        id: "variable-product",
        code: "VAR-1",
        description: "Variable-price item",
        price: 125,
        salePrice: 0,
        amount: 2,
      }],
    });

    expect(result).toEqual({ success: true, orderId: "budget-zero-price" });
    expect(db.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: {
          create: [expect.objectContaining({
            productId: "variable-product",
            costPrice: 125,
            price: 0,
            quantity: 2,
            subTotal: 0,
          })],
        },
      }),
    }));
  });
});
