import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateBusinessFeaturesAction } from "@/actions/superadmin";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Plan } from "@prisma/client";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
  },
}));

describe("Superadmin Actions Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject validation if user role is not SUPER_ADMIN", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        role: "ADMIN",
      },
    } as any);

    const payload = {
      businessId: "biz_1",
      plan: Plan.PRO,
      hasAfipBilling: false,
      hasPublicCatalog: true,
      hasClientLedger: true,
      hasMultiCashbox: false,
      hasSupplierFilter: false,
      hasBudget: false,
      maxUsers: 5,
      maxProducts: 1000,
    };

    const result = await updateBusinessFeaturesAction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("No autorizado");
    }
  });

  it("should execute updates successfully inside a transaction for valid payload and role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        role: "SUPER_ADMIN",
      },
    } as any);

    const mockTx = {
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: "biz_1" }),
      },
      businessFeatures: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      return callback(mockTx);
    });

    const payload = {
      businessId: "biz_1",
      plan: Plan.PRO,
      hasAfipBilling: false,
      hasPublicCatalog: true,
      hasClientLedger: true,
      hasMultiCashbox: false,
      hasSupplierFilter: false,
      hasBudget: false,
      maxUsers: 5,
      maxProducts: 1000,
    };

    const result = await updateBusinessFeaturesAction(payload);
    expect(result.success).toBe(true);
    expect(mockTx.businessFeatures.upsert).toHaveBeenCalledTimes(1);
  });
});
