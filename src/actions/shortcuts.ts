"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  SaveShortcutConfigSchema,
} from "@/schemas";
import type { ShortcutConfigView, ShortcutKey } from "@/models/ShortcutConfig";
import Product from "@/models/Product";

function getSessionBusinessId(
  session: unknown
): string | null {
  if (!session) return null;
  const s = session as { user?: { businessId?: string } };
  if (!s.user?.businessId) return null;
  return s.user.businessId;
}

function unauthorized() {
  return { error: "No autorizado" as const };
}

export async function getShortcutConfigsAction(
  businessId: string
) {
  try {
    const session = await auth();
    const sessionBusinessId = getSessionBusinessId(session);
    if (!sessionBusinessId) {
      return unauthorized();
    }

    const configs = await db.shortcutConfig.findMany({
      where: { businessId },
      include: {
        product: {
          select: { id: true, description: true, code: true, salePrice: true },
        },
      },
    });

    return { success: true as const, data: configs as ShortcutConfigView[] };
  } catch (error) {
    console.error("Error getting shortcut configs:", error);
    return { success: false as const, error: "Error al obtener configuraciones de atajos" };
  }
}

export async function saveShortcutConfigAction(
  businessId: string,
  key: ShortcutKey,
  productId: string
) {
  try {
    const session = await auth();
    const sessionBusinessId = getSessionBusinessId(session);
    if (!sessionBusinessId) {
      return unauthorized();
    }

    // Validate input
    const validation = SaveShortcutConfigSchema.safeParse({ key, productId });
    if (!validation.success) {
      return {
        success: false as const,
        error: validation.error.errors.map((e) => e.message).join(", "),
      };
    }

    const config = await db.shortcutConfig.upsert({
      where: {
        businessId_key: { businessId, key },
      },
      update: { productId },
      create: {
        businessId,
        key,
        productId,
      },
      include: {
        product: {
          select: { id: true, description: true, code: true, salePrice: true },
        },
      },
    });

    revalidatePath("/admin/settings");
    return { success: true as const, data: config as ShortcutConfigView };
  } catch (error) {
    console.error("Error saving shortcut config:", error);
    return { success: false as const, error: "Error al guardar configuración de atajo" };
  }
}

export async function deleteShortcutConfigAction(
  businessId: string,
  key: ShortcutKey
) {
  try {
    const session = await auth();
    const sessionBusinessId = getSessionBusinessId(session);
    if (!sessionBusinessId) {
      return unauthorized();
    }

    await db.shortcutConfig.delete({
      where: {
        businessId_key: { businessId, key },
      },
    });

    revalidatePath("/admin/settings");
    return { success: true as const };
  } catch (error) {
    console.error("Error deleting shortcut config:", error);
    return {
      success: false as const,
      error: "Error al eliminar configuración de atajo",
    };
  }
}

export async function getProductByShortcutAction(
  key: ShortcutKey
) {
  try {
    const session = await auth();
    const businessId = getSessionBusinessId(session);
    if (!businessId) {
      return unauthorized();
    }

    const config = await db.shortcutConfig.findUnique({
      where: {
        businessId_key: { businessId, key },
      },
      include: { product: true },
    });

    if (!config || !config.product) {
      return { success: true as const, data: null };
    }

    return { success: true as const, data: config.product as unknown as Product };
  } catch (error) {
    console.error("Error getting product by shortcut:", error);
    return { success: false as const, error: "Error al obtener producto por atajo" };
  }
}
