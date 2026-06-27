import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { updateBusinessFeaturesAction } from "@/actions/superadmin";
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
      overrides: { hasAfipBilling: true },
    };

    const result = await updateBusinessFeaturesAction(payload);
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

    const result = await updateBusinessFeaturesAction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Plan no encontrado");
    }
  });

  it("should reject if override key does not exist in PlanDefinition", async () => {
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

    const payload = {
      businessId: "biz_1",
      planDefinitionId: "plan_pro",
      overrides: { invalidKey: true },
    };

    const result = await updateBusinessFeaturesAction(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Override inválido");
      expect(result.error).toContain("PRO");
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
      planDefinitionId: "plan_pro",
      overrides: { hasAfipBilling: false, maxProducts: 2000 },
    };

    const result = await updateBusinessFeaturesAction(payload);
    expect(result.success).toBe(true);
    expect(mockTx.businessFeatures.upsert).toHaveBeenCalledTimes(1);
    expect(mockTx.businessFeatures.upsert).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
      update: {
        planDefinitionId: "plan_pro",
        overrides: { hasAfipBilling: false, maxProducts: 2000 },
      },
      create: {
        businessId: "biz_1",
        planDefinitionId: "plan_pro",
        overrides: { hasAfipBilling: false, maxProducts: 2000 },
      },
    });
  });

  it("should set overrides to JsonNull when not provided", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        role: "SUPER_ADMIN",
      },
    } as any);

    vi.mocked(db.planDefinition.findUnique).mockResolvedValue({
      id: "plan_basic",
      name: "BASIC",
      features: { hasAfipBilling: false, hasPublicCatalog: false },
      limits: { maxUsers: 1, maxProducts: 100 },
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
      planDefinitionId: "plan_basic",
    };

    const result = await updateBusinessFeaturesAction(payload);
    expect(result.success).toBe(true);
    // Verify upsert was called with Prisma.JsonNull for overrides
    const call = mockTx.businessFeatures.upsert.mock.calls[0][0];
    expect(call.create.overrides).toBe(Prisma.JsonNull);
  });
});
