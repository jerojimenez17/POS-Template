"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

export async function getBusinessConfig() {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    const business = await db.business.findUnique({
      where: { id: session.user.businessId },
      select: {
        name: true,
        slug: true,
        brandLogo: true,
        brandPrimaryColor: true,
        brandSecondaryColor: true,
        defaultInvoiceDueDays: true,
        enableCustomerNotifications: true,
        enableLowStockAlerts: true,
        lowStockThreshold: true,
        timezone: true,
      },
    });

    return { success: business };
  } catch (error) {
    console.error("Error fetching business config:", error);
    return { error: "Error al obtener configuración" };
  }
}

export async function updateBusinessConfig(data: {
  brandLogo?: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  defaultInvoiceDueDays?: number;
  enableCustomerNotifications?: boolean;
  enableLowStockAlerts?: boolean;
  lowStockThreshold?: number;
  timezone?: string;
}) {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    await db.business.update({
      where: { id: session.user.businessId },
      data,
    });

    revalidateTag(CACHE_TAGS.BUSINESS, "max");
    return { success: "Configuración actualizada" };
  } catch (error) {
    console.error("Error updating business config:", error);
    return { error: "Error al actualizar configuración" };
  }
}
