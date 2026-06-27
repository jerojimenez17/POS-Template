"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { fail } from "@/lib/action-result";
import { checkLimit } from "@/lib/plan-resolver";
import { getDailyUsage, checkDailyLimit, incrementDailyUsage } from "@/lib/daily-limits";

export const createClient = async (data: {
  name: string;
  address?: string;
  cellPhone?: string;
  cuit?: string;
  ivaCondition?: string;
  balance?: number;
}) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const currentCount = await db.client.count({ where: { businessId: session.user.businessId } });
  try {
    await checkLimit(session.user.businessId, "clients", currentCount);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Has alcanzado el límite de clientes de tu plan." };
  }

  // Daily limit check for DEMO plan
  const usage = await getDailyUsage(session.user.businessId);
  const dailyLimitCheck = await checkDailyLimit(session.user.businessId, "dailyClientsLimit", usage.clientsCreated);
  if (!dailyLimitCheck.allowed) {
    return { error: `Has superado el límite diario de creación de clientes (${dailyLimitCheck.limit}).` };
  }

  try {
    const client = await db.client.create({
      data: {
        name: data.name,
        address: data.address,
        cellPhone: data.cellPhone,
        cuit: data.cuit,
        ivaCondition: data.ivaCondition,
        balance: data.balance || 0,
        businessId: session.user.businessId,
      },
    });
    await incrementDailyUsage(session.user.businessId, "clientsCreated");
    revalidateTag(CACHE_TAGS.CLIENTS, "max");
    revalidateTag(CACHE_TAGS.CLIENTS, "max");
    return { success: "Cliente agregado", client };
  } catch (error) {
    console.error(error);
    return { error: "Error al guardar cliente" };
  }
};

export const getClients = async () => {
    try {
        return await db.client.findMany({
            orderBy: { name: 'asc' }
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

export const updateClientBalance = async (clientId: string, amountToAdd: number) => {
    try {
        const client = await db.client.findUnique({ where: { id: clientId } });
        if (!client) return fail("Cliente no encontrado", "NOT_FOUND");
        
        await db.client.update({
            where: { id: clientId },
            data: { 
                balance: { increment: amountToAdd },
                last_update: new Date()
            }
        });
        return { success: true };
    } catch (error) {
        console.error("Error updating client balance:", error);
        return fail("Error al actualizar saldo del cliente");
    }
}
