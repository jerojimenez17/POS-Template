import { describe, it, expect, vi, beforeEach } from "vitest";
import { openSession, closeSession, getActiveSession } from "@/actions/cashbox";

vi.mock("@/lib/db", () => ({
  db: {
    cashboxSession: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    cashBox: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ cashboxId: "cashbox-1" }),
    },
    order: {
      findMany: vi.fn(),
    },
    saleReturn: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "user-1", businessId: "business-123", cashboxId: "cashbox-1" },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Cashbox Sessions - Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("openSession", () => {
    it("should successfully open a session if no active session exists", async () => {
      const { db } = await import("@/lib/db");

      // Mock no active session
      (db.cashboxSession.findFirst as any).mockResolvedValue(null);

      // Mock creation
      const newSession = {
        id: "session-1",
        userId: "user-1",
        cashboxId: "cashbox-1",
        businessId: "business-123",
        initialBalance: 1000,
        status: "OPEN",
      };
      (db.cashboxSession.create as any).mockResolvedValue(newSession);

      const result = await openSession(1000);

      expect(result.success).toBe(true);
      expect(result.session?.id).toBe("session-1");
      expect(db.cashboxSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            initialBalance: 1000,
            status: "OPEN",
          }),
        })
      );
    });

    it("should return an error if a session is already open", async () => {
      const { db } = await import("@/lib/db");

      // Mock an existing open session
      (db.cashboxSession.findFirst as any).mockResolvedValue({ id: "session-existing", status: "OPEN" });

      const result = await openSession(1000);

      expect(result.error).toBe("Ya existe una sesión abierta.");
      expect(db.cashboxSession.create).not.toHaveBeenCalled();
    });

    it("should return an error if the user has no cashbox assigned", async () => {
      const { db } = await import("@/lib/db");
      const authModule = await import("../../../auth");
      // Change auth mock for this test
      (authModule.auth as any).mockResolvedValueOnce({
        user: { id: "user-no-cashbox", businessId: "business-123", cashboxId: null },
      });
      // Also mock user DB lookup to return no cashbox
      (db.user.findUnique as any).mockResolvedValueOnce({ cashboxId: null });

      const result = await openSession(1000);

      expect(result.error).toBe("No tienes una caja asignada.");
    });
  });

  describe("closeSession", () => {
    it("should close the active session and generate a Z-Report", async () => {
      const { db } = await import("@/lib/db");

      // Mock active session
      const activeSession = {
        id: "session-1",
        cashboxId: "cashbox-1",
        status: "OPEN",
        initialBalance: 1000,
      };
      (db.cashboxSession.findFirst as any).mockResolvedValue(activeSession);

      // Mock orders for Z-Report calculation
      (db.order.findMany as any).mockResolvedValue([
        { total: 500, discountAmount: 0, paymentMethod: "Efectivo", paymentMethod2: null, totalMethod2: null },
        { total: 300, discountAmount: 0, paymentMethod: "Tarjeta", paymentMethod2: null, totalMethod2: null },
      ]);
      (db.saleReturn.findMany as any).mockResolvedValue([]);

      // Mock update
      (db.cashboxSession.update as any).mockResolvedValue({
        ...activeSession,
        status: "CLOSED",
        finalBalance: 1800,
      });

      const result = await closeSession(1800);

      expect(result.success).toBe(true);
      expect(db.cashboxSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: expect.objectContaining({
            status: "CLOSED",
            finalBalance: 1800,
            zReport: expect.any(Object), // Should contain calculated totals
          }),
        })
      );
    });

    it("should return an error if there is no active session", async () => {
      const { db } = await import("@/lib/db");

      // Mock no active session
      (db.cashboxSession.findFirst as any).mockResolvedValue(null);

      const result = await closeSession(1000);

      expect(result.error).toBe("No hay ninguna sesión abierta.");
      expect(db.cashboxSession.update).not.toHaveBeenCalled();
    });
  });
});
