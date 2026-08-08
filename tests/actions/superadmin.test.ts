import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateBusinessPlanAction } from "@/actions/superadmin";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    planDefinition: {
      findUnique: vi.fn(),
    },
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
      planDefinitionId: "plan_pro",
    };

    const result = await updateBusinessPlanAction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("No autorizado");
    }
  });

  it("should reject if PlanDefinition not found", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        role: "SUPER_ADMIN",
      },
    } as any);

    vi.mocked(db.planDefinition.findUnique).mockResolvedValue(null);

    const payload = {
      businessId: "biz_1",
      planDefinitionId: "nonexistent",
    };

    const result = await updateBusinessPlanAction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Plan no encontrado");
    }
  });

  it("should execute updates successfully inside a transaction for valid payload and role", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        role: "SUPER_ADMIN",
      },
    } as any);

    vi.mocked(db.planDefinition.findUnique).mockResolvedValue({
      id: "plan_pro",
      name: "PRO",
      features: { hasAfipBilling: true, hasPublicCatalog: true },
      limits: { maxUsers: 5, maxProducts: 1000 },
    } as any);

    const mockTx = {
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: "biz_1" }),
        update: vi.fn().mockResolvedValue({ id: "biz_1" }),
      },
    };

    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      return callback(mockTx);
    });

    const payload = {
      businessId: "biz_1",
      planDefinitionId: "plan_pro",
    };

    const result = await updateBusinessPlanAction(payload);
    expect(result.success).toBe(true);
    expect(mockTx.business.update).toHaveBeenCalledTimes(1);
    expect(mockTx.business.update).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: { planDefinitionId: "plan_pro" },
    });
  });
});
