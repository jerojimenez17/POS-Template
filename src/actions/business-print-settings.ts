"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { z } from "zod";

export interface BusinessPrintSettings { businessId: string; qzTray: boolean; address: string | null; }
const updateSchema = z.object({ qzTray: z.boolean(), address: z.string().nullable() });

export async function getBusinessPrintSettingsAction(): Promise<BusinessPrintSettings | { error: string }> {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };
  try {
    const business = await db.business.findUnique({ where: { id: businessId }, select: { id: true, qzTray: true, address: true } });
    if (!business) return { error: "Negocio no encontrado" };
    return { businessId: business.id, qzTray: business.qzTray, address: business.address };
  } catch (error) {
    console.error("Error fetching business print settings:", error);
    return { error: "Error al obtener configuración de impresión" };
  }
}

export async function updateBusinessPrintSettingsAction(input: unknown): Promise<{ success?: string; error?: string }> {
  const session = await auth();
  if (!session?.user?.businessId || session.user.role !== "ADMIN") return { error: "No autorizado" };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: "Campos inválidos" };
  try {
    await db.business.update({ where: { id: session.user.businessId }, data: { qzTray: parsed.data.qzTray, address: parsed.data.address?.trim() || null } });
    revalidateTag(CACHE_TAGS.BUSINESS, "max");
    revalidateTag("business-print-settings", "max");
    return { success: "Configuración de impresión actualizada" };
  } catch (error) {
    console.error("Error updating business print settings:", error);
    return { error: "Error al actualizar configuración de impresión" };
  }
}
