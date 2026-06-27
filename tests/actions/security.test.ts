import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireFeature, assertWritePermission, assertLimit } from "@/lib/auth-gates";
import { auth } from "@/lib/auth";
import { createAfipVoucherAction } from "@/actions/afip";
import { createOrder } from "@/actions/orders";
import { createCashbox, openSession } from "@/actions/cashbox";
import { getPublicProductsByBusinessId } from "@/actions/catalog";
import { getEffectivePlan } from "@/lib/plan-resolver";
import { db } from "@/lib/db";
import type { ActionResult } from "@/lib/action-result";

// Mock plan-resolver for catalog tests
vi.mock("@/lib/plan-resolver", () => ({
  getEffectivePlan: vi.fn(),
}));

const mockAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

vi.mock("../../auth", () => ({
  auth: mockAuth,
}));

vi.mock("@/auth", () => ({
  auth: mockAuth,
}));

describe("Server-Side Action Security Gates Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Dynamically ensure methods exist on mockDb for spying
    (db as any).cashBox = (db as any).cashBox || {};
    (db as any).cashBox.count = (db as any).cashBox.count || vi.fn();
    (db as any).cashBox.create = (db as any).cashBox.create || vi.fn();
    
    (db as any).cashboxSession = (db as any).cashboxSession || {};
    (db as any).cashboxSession.count = (db as any).cashboxSession.count || vi.fn();
    (db as any).cashboxSession.findFirst = (db as any).cashboxSession.findFirst || vi.fn();
    (db as any).cashboxSession.create = (db as any).cashboxSession.create || vi.fn();

    (db as any).businessFeatures = (db as any).businessFeatures || {};
    (db as any).businessFeatures.findUnique = (db as any).businessFeatures.findUnique || vi.fn();

    (db as any).product = (db as any).product || {};
    (db as any).product.findMany = (db as any).product.findMany || vi.fn().mockResolvedValue([]);
  });

  it("should fail validation if user is unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const result = await assertWritePermission();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Debes iniciar sesión para realizar esta acción.");
      expect(result.code).toBe("UNAUTHENTICATED");
    }
  });

  it("should fail validation with DELINQUENT if business status is MOROSO", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        businessId: "business_123",
        business: {
          accountStatus: "MOROSO",
        },
      },
    } as any);

    const result = await assertWritePermission();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Acción bloqueada. Tu cuenta posee facturas vencidas impagas.");
      expect(result.code).toBe("DELINQUENT");
    }
  });

  it("should fail module gate with FORBIDDEN if specific feature toggle is disabled", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        businessId: "business_123",
        business: {
          accountStatus: "ACTIVO",
          features: {
            hasAfipBilling: false,
          },
        },
      },
    } as any);

    const result = await requireFeature("hasAfipBilling");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Esta función no está habilitada en tu plan actual.");
      expect(result.code).toBe("FORBIDDEN");
    }
  });

  it("should pass module gate if specific feature toggle is enabled", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        businessId: "business_123",
        business: {
          accountStatus: "ACTIVO",
          features: {
            hasAfipBilling: true,
          },
        },
      },
    } as any);

    const result = await requireFeature("hasAfipBilling");
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.businessId).toBe("business_123");
    }
  });

  it("should block user limit checks if threshold is exceeded", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        businessId: "business_123",
        business: {
          accountStatus: "ACTIVO",
          features: {
            maxProducts: 100,
          },
        },
      },
    } as any);

    const result = await assertLimit("maxProducts", 100);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Has superado el límite permitido");
      expect(result.code).toBe("LIMIT_EXCEEDED");
    }
  });

  describe("Phase 4: Server Action Gated Scenarios", () => {
    describe("1. AFIP billing action (hasAfipBilling)", () => {
      it("should reject voucher generation if hasAfipBilling is false", async () => {
        vi.mocked(auth).mockResolvedValue({
          user: {
            businessId: "business_123",
            business: {
              accountStatus: "ACTIVO",
              features: {
                hasAfipBilling: false,
              },
            },
          },
        } as any);

        const result = await createAfipVoucherAction({} as any);
        expect((result as any).error).toContain("Esta función no está habilitada");
      });
    });

    describe("2. Orders / Unpaid (A cuenta) action (hasClientLedger)", () => {
      it("should reject creating order with paidStatus: inpago if hasClientLedger is false", async () => {
        vi.mocked(auth).mockResolvedValue({
          user: {
            businessId: "business_123",
            business: {
              accountStatus: "ACTIVO",
              features: {
                hasClientLedger: false,
              },
            },
          },
        } as any);

        const result = await createOrder({
          businessId: "business_123",
          client: { id: "client_1" },
          products: [],
          total: 100,
          paidStatus: "inpago",
        });

        expect((result as any).error).toContain("Esta función no está habilitada");
      });

      it("should allow creating order with paidStatus: inpago if hasClientLedger is true", async () => {
        vi.mocked(auth).mockResolvedValue({
          user: {
            businessId: "business_123",
            business: {
              accountStatus: "ACTIVO",
              features: {
                hasClientLedger: true,
              },
            },
          },
        } as any);

        // Mock database calls for createOrder to avoid empty array issues
        vi.spyOn(db, "$transaction").mockImplementation(async (cb: any) => cb(db));
        vi.spyOn(db.client, "update").mockResolvedValue({} as any);
        vi.spyOn(db.order, "create").mockResolvedValue({ id: "order_123" } as any);

        const result = await createOrder({
          businessId: "business_123",
          client: { id: "client_1" },
          products: [],
          total: 100,
          paidStatus: "inpago",
        });

        expect((result as any).success).toBe("Orden creada");
      });
    });

    describe("3. Cashbox actions (hasMultiCashbox)", () => {
      it("should reject creating a second cashbox if hasMultiCashbox is false", async () => {
        vi.mocked(auth).mockResolvedValue({
          user: {
            businessId: "business_123",
            role: "ADMIN",
            business: {
              accountStatus: "ACTIVO",
              features: {
                hasMultiCashbox: false,
              },
            },
          },
        } as any);

        vi.spyOn(db.cashBox, "count").mockResolvedValue(1);

        const result = await createCashbox("Caja Secundaria", 0);
        expect((result as any).error).toContain("Esta función no está habilitada");
      });

      it("should reject opening session if another session is already open and hasMultiCashbox is false", async () => {
        vi.mocked(auth).mockResolvedValue({
          user: {
            id: "user_1",
            businessId: "business_123",
            cashboxId: "cashbox_1",
            business: {
              accountStatus: "ACTIVO",
              features: {
                hasMultiCashbox: false,
              },
            },
          },
        } as any);

        vi.spyOn(db.cashboxSession, "count").mockResolvedValue(1);

        const result = await openSession(0);
        expect((result as any).error).toContain("Esta función no está habilitada");
      });
    });

    describe("4. Catalog public product action (hasPublicCatalog)", () => {
      it("should reject fetching products if hasPublicCatalog is false", async () => {
        vi.mocked(getEffectivePlan).mockResolvedValue({
          plan: "BASIC",
          hasAfipBilling: false,
          hasPublicCatalog: false,
          hasClientLedger: false,
          hasMultiCashbox: false,
          hasSupplierFilter: false,
          hasBudget: false,
          maxUsers: 1,
          maxProducts: 100,
          maxCashboxes: 1,
          maxClients: 50,
          dailySalesLimit: 999999,
        });

        await expect(getPublicProductsByBusinessId("business_123")).rejects.toThrowError(
          "El catálogo público no está habilitado"
        );
        expect(getEffectivePlan).toHaveBeenCalledWith("business_123");
      });
    });
  });
});
