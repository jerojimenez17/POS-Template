"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidatePath } from "next/cache";

export const getCashboxes = async () => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  try {
    const cashboxes = await db.cashBox.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });
    return { success: true, data: cashboxes };
  } catch (error) {
    console.error("Error fetching cashboxes:", error);
    return { error: "Error al obtener cajas" };
  }
};

export const createCashbox = async (name: string, initialTotal: number = 0) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  const role = session?.user?.role;
  
  if (!businessId || role !== "ADMIN") return { error: "No autorizado" };

  try {
    const cashbox = await db.cashBox.create({
      data: {
        name,
        total: initialTotal,
        businessId,
      },
    });
    revalidatePath("/admin/cashboxes");
    return { success: true, data: cashbox };
  } catch (error) {
    console.error("Error creating cashbox:", error);
    return { error: "Error al crear caja" };
  }
};

export const updateCashbox = async (id: string, name: string) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  const role = session?.user?.role;
  
  if (!businessId || role !== "ADMIN") return { error: "No autorizado" };

  try {
    const cashbox = await db.cashBox.update({
      where: { id, businessId },
      data: { name },
    });
    revalidatePath("/admin/cashboxes");
    return { success: true, data: cashbox };
  } catch (error) {
    console.error("Error updating cashbox:", error);
    return { error: "Error al actualizar caja" };
  }
};

export const deleteCashbox = async (id: string) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  const role = session?.user?.role;
  
  if (!businessId || role !== "ADMIN") return { error: "No autorizado" };

  try {
    await db.cashBox.delete({
      where: { id, businessId },
    });
    revalidatePath("/admin/cashboxes");
    return { success: true };
  } catch (error) {
    console.error("Error deleting cashbox:", error);
    return { error: "Error al eliminar caja" };
  }
};

export const getActiveSession = async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "No autorizado" };

  try {
    const activeSession = await db.cashboxSession.findFirst({
      where: { userId, status: "OPEN" },
      include: { cashbox: true },
    });
    return { success: true, data: activeSession };
  } catch (error) {
    console.error("Error getting active session:", error);
    return { error: "Error al obtener sesión activa" };
  }
};

export const openSession = async (initialBalance: number) => {
  const session = await auth();
  const userId = session?.user?.id;
  const businessId = session?.user?.businessId;
  // @ts-ignore - NextAuth types might need update
  const cashboxId = session?.user?.cashboxId;

  if (!userId || !businessId) return { error: "No autorizado" };

  // 1. Verify user has a cashbox assigned
  if (!cashboxId) {
    // Maybe they are an admin or we just find a default one if none assigned, but specs say they must have one assigned
    // For fallback, let's try to find their assigned cashbox from DB since session might be stale
    const userFromDb = await db.user.findUnique({ where: { id: userId }, select: { cashboxId: true } });
    if (!userFromDb?.cashboxId) {
      return { error: "No tienes una caja asignada." };
    }
  }

  const assignedCashboxId = cashboxId || (await db.user.findUnique({ where: { id: userId } }))?.cashboxId;
  if (!assignedCashboxId) return { error: "No tienes una caja asignada." };

  try {
    // 2. Check if already open
    const existing = await db.cashboxSession.findFirst({
      where: { userId, status: "OPEN" },
    });
    if (existing) {
      return { error: "Ya existe una sesión abierta." };
    }

    // 3. Create session
    const newSession = await db.cashboxSession.create({
      data: {
        userId,
        cashboxId: assignedCashboxId,
        businessId,
        initialBalance,
        status: "OPEN",
      },
    });
    
    // We do not increment CashBox total directly here, CashBox total is a running total of deposits.
    revalidatePath("/newBill");
    return { success: true, session: newSession };
  } catch (error) {
    console.error("Error opening session:", error);
    return { error: "Error al abrir sesión" };
  }
};

export const closeSession = async (finalBalanceInput?: number) => {
  const session = await auth();
  const userId = session?.user?.id;
  const businessId = session?.user?.businessId;

  if (!userId || !businessId) return { error: "No autorizado" };

  try {
    // 1. Find active session
    const activeSession = await db.cashboxSession.findFirst({
      where: { userId, status: "OPEN" },
    });

    if (!activeSession) {
      return { error: "No hay ninguna sesión abierta." };
    }

    // 2. Calculate Z-Report (totals since session started)
    // We look at orders & returns that belong to this session
    const orders = await db.order.findMany({
      where: { cashboxSessionId: activeSession.id },
    });

    const returns = await db.saleReturn.findMany({
      where: { order: { cashboxSessionId: activeSession.id } },
    });

    let totalSales = 0;
    let totalDiscounts = 0;
    const paymentMethods: Record<string, number> = {};

    orders.forEach((o) => {
      totalSales += o.total;
      totalDiscounts += o.discountAmount;
      if (o.paymentMethod) {
        const amount1 = o.total - (o.totalMethod2 || 0);
        paymentMethods[o.paymentMethod] = (paymentMethods[o.paymentMethod] || 0) + amount1;
      }
      if (o.paymentMethod2 && (o.totalMethod2 || 0) > 0) {
        paymentMethods[o.paymentMethod2] = (paymentMethods[o.paymentMethod2] || 0) + (o.totalMethod2 || 0);
      }
    });

    const totalReturns = returns.reduce((acc, r) => acc + r.total, 0);

    const expectedFinalBalance = activeSession.initialBalance + (paymentMethods["Efectivo"] || 0) - totalReturns;
    const declaredFinalBalance = finalBalanceInput !== undefined ? finalBalanceInput : expectedFinalBalance;

    const zReport = {
      totalSales,
      totalDiscounts,
      totalReturns,
      netTotal: totalSales - totalReturns,
      orderCount: orders.length,
      returnCount: returns.length,
      paymentMethods,
      expectedFinalBalance,
      declaredFinalBalance,
      difference: declaredFinalBalance - expectedFinalBalance,
    };

    // 3. Close session and save Z-Report
    const closedSession = await db.cashboxSession.update({
      where: { id: activeSession.id },
      data: {
        status: "CLOSED",
        endTime: new Date(),
        finalBalance: declaredFinalBalance,
        zReport,
      },
    });

    // 4. Update the cashbox total to the final balance
    await db.cashBox.update({
      where: { id: activeSession.cashboxId },
      data: {
        total: zReport.expectedFinalBalance,
      },
    });

    revalidatePath("/newBill");
    return { success: true, session: closedSession, zReport };
  } catch (error) {
    console.error("Error closing session:", error);
    return { error: "Error al cerrar sesión" };
  }
};

export const getCashboxSessions = async (cashboxId: string) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  try {
    const sessions = await db.cashboxSession.findMany({
      where: { cashboxId, businessId },
      orderBy: { startTime: "desc" },
    });
    return { success: true, data: sessions };
  } catch (error) {
    console.error("Error fetching cashbox sessions:", error);
    return { error: "Error al obtener sesiones" };
  }
};
