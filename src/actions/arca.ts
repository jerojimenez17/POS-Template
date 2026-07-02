"use server";

import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { auth } from "../../auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { encrypt } from "@/lib/encryption";
import { requireFeature } from "@/lib/auth-gates";
import * as z from "zod";
import { ArcaFieldsSchema } from "@/schemas";
import { ArcaUpdateInput, ArcaData } from "@/models/Arca";

export const updateBusinessArcaData = async (
  businessId: string,
  values: z.infer<typeof ArcaFieldsSchema>
): Promise<{ success?: string; error?: string }> => {
  const session = await auth();

  if (!session || (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.ADMIN)) {
    return { error: "No autorizado" };
  }

  if (session.user.role === UserRole.ADMIN && session.user.businessId !== businessId) {
    return { error: "No autorizado para modificar otro negocio" };
  }

  // FR-025: businesses without hasAfipBilling may not mutate ARCA config.
  const feature = await requireFeature("hasAfipBilling");
  if (!feature.success) {
    return { error: feature.error || "Esta función no está habilitada en tu plan actual." };
  }

  const validatedFields = ArcaFieldsSchema.safeParse(values);

  if (!validatedFields.success) {
    return { error: "Campos inválidos" };
  }

  const { cuit: rawCuit, razonSocial, inicioActividades, condicionIva, cert, key, ptoVenta } = validatedFields.data;
  const cuit = rawCuit.replace(/\D/g, ""); // Normalizar: guardar solo dígitos

  try {
    const updateData: ArcaUpdateInput = {
      cuit,
      razonSocial,
      inicioActividades,
      condicionIva,
      ptoVenta,
    };

    if (cert) {
      updateData.cert = encrypt(cert);
    }

    if (key) {
      updateData.key = encrypt(key);
    }

    await db.business.update({
      where: { id: businessId },
      data: updateData,
    });

    revalidateTag(CACHE_TAGS.ARCA, "max");
    revalidateTag(CACHE_TAGS.ARCA, "max");
    
    return { success: "Datos de ARCA actualizados" };
  } catch (error) {
    console.error("ARCA Update Error:", error);
    return { error: "Error al actualizar datos de ARCA" };
  }
};

export const getBusinessArcaData = async (
  businessId: string
): Promise<{ success?: ArcaData; error?: string }> => {
    const session = await auth();

    if (!session || (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.ADMIN)) {
        return { error: "No autorizado" };
    }

    if (session.user.role === UserRole.ADMIN && session.user.businessId !== businessId) {
        return { error: "No autorizado para ver otro negocio" };
    }

    // FR-025: businesses without hasAfipBilling may not read ARCA config.
    const feature = await requireFeature("hasAfipBilling");
    if (!feature.success) {
        return { error: feature.error || "Esta función no está habilitada en tu plan actual." };
    }

    try {
        const business = await db.business.findUnique({
            where: { id: businessId },
            select: {
                cuit: true,
                razonSocial: true,
                inicioActividades: true,
                condicionIva: true,
                cert: true,
                key: true,
                ptoVenta: true,
            }
        });

        if (!business) {
            return { error: "Negocio no encontrado" };
        }

        return { success: business };
    } catch (error) {
        console.error("Get ARCA Data Error:", error);
        return { error: "Error al obtener datos de ARCA" };
    }
}

export const getArcaCredentialsForBilling = async () => {
    const session = await auth();
    const businessId = session?.user?.businessId;

    if (!businessId) {
        return { error: "No autorizado" };
    }

    // FR-025: ARCA credentials are only readable when AFIP billing is enabled.
    const feature = await requireFeature("hasAfipBilling");
    if (!feature.success) {
        return { error: feature.error || "Esta función no está habilitada en tu plan actual." };
    }

    try {
        const business = await db.business.findUnique({
            where: { id: businessId },
            select: {
                cuit: true,
                cert: true,
                key: true,
            },
        });

        if (!business) {
            return { error: "Negocio no encontrado" };
        }

        if (!business.cuit || !business.cert || !business.key) {
            return { error: "Credenciales de ARCA incompletas. Por favor consulte con soporte." };
        }

        return {
            success: {
                cuit: business.cuit,
                cert: business.cert,
                key: business.key,
            },
        };
    } catch (error) {
        console.error("Get ARCA Credentials Error:", error);
        return { error: "Error al obtener credenciales de ARCA" };
    }
};
