"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidatePath } from "next/cache";

export const getBusinessStatusAction = async () => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return null;

  try {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        accountStatus: true,
        lastPaymentDate: true,
      },
    });

    if (!business) return null;

    const now = new Date();
    const dayOfMonth = now.getDate();
    
    // Logic: 
    // - From 1st to 10th: show reminder if not paid this month
    // - After 10th: if status is MOROSO or DESACTIVADO, block access.
    
    const isPaidThisMonth = business.lastPaymentDate && 
      business.lastPaymentDate.getMonth() === now.getMonth() &&
      business.lastPaymentDate.getFullYear() === now.getFullYear();

    let message = null;
    let shouldBlock = false;
    let type: "info" | "warning" | "error" = "info";

    if (business.accountStatus === "DESACTIVADO") {
      message = "Tu cuenta ha sido desactivada por falta de pago. Contacta al soporte.";
      shouldBlock = true;
      type = "error";
    } else if (dayOfMonth > 10 && !isPaidThisMonth) {
      if (business.accountStatus === "ACTIVO") {
         // Auto-transition to MOROSO if past 10th and not paid? 
         // For now, just rely on superadmin setting status, but let's check dayOfMonth
         message = "Tu pago está vencido. Regulariza tu situación para evitar la desactivación.";
         type = "warning";
      }
    } else if (dayOfMonth >= 1 && dayOfMonth <= 10 && !isPaidThisMonth) {
      message = `Recuerda realizar el pago mensual antes del día 10. (Día actual: ${dayOfMonth})`;
      type = "info";
    }

    return {
      status: business.accountStatus,
      message,
      shouldBlock,
      type
    };
  } catch (error) {
    console.error("Error checking business status:", error);
    return null;
  }
};

export const updateBusinessStatusAction = async (businessId: string, status: "ACTIVO" | "MOROSO" | "DESACTIVADO") => {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return { error: "No autorizado" };

  try {
    await db.business.update({
      where: { id: businessId },
      data: { accountStatus: status },
    });
    revalidatePath("/admin/businesses");
    return { success: true };
  } catch {
    return { error: "Error al actualizar estado" };
  }
};

export const registerPaymentAction = async (businessId: string) => {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return { error: "No autorizado" };

  try {
    await db.business.update({
      where: { id: businessId },
      data: { 
        lastPaymentDate: new Date(),
        accountStatus: "ACTIVO"
      },
    });
    revalidatePath("/admin/businesses");
    return { success: true };
  } catch {
    return { error: "Error al registrar pago" };
  }
};

export const getBusinessBillingInfoAction = async () => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return null;

  try {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        cuit: true,
        razonSocial: true,
        inicioActividades: true,
        condicionIva: true,
        address: true,
      },
    });

    return business;
  } catch (error) {
    console.error("Error fetching business billing info:", error);
    return null;
  }
};
