import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock implementation of prisma and the module
// We will test the validation logic of the form schema primarily here

import { createPublicOrder } from "../../../src/actions/public-orders";

// Mock pusher
vi.mock("@/lib/pusher-server", () => ({
  pusherServer: {
    trigger: vi.fn(),
  },
}));

// Mock db
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    client: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    order: {
      create: vi.fn(),
    },
  },
}));

describe("createPublicOrder Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fail validation if DNI is empty", async () => {
    const input = {
      businessId: "test-business",
      client: {
        dni: "", 
        name: "Test Name",
        phone: "123456"
      },
      items: [{ productId: "1", price: 100, quantity: 1, subTotal: 100 }],
      total: 100
    };

    const res = await createPublicOrder(input as unknown as Parameters<typeof createPublicOrder>[0]);
    expect(res.success).toBe(false);
  });

  it("should fail validation if neither phone nor email is provided", async () => {
    const input = {
      businessId: "test-business",
      client: {
        dni: "12345678", 
        name: "Test Name",
        phone: "",
        email: ""
      },
      items: [{ productId: "1", price: 100, quantity: 1, subTotal: 100 }],
      total: 100
    };

    const res = await createPublicOrder(input as unknown as Parameters<typeof createPublicOrder>[0]);
    expect(res.success).toBe(false);
  });
});
