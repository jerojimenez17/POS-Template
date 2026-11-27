"use server";

import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { auth } from "../../auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { encrypt } from "@/lib/encryption";
import { requireFeature, type AuthenticatedUserContext } from "@/lib/auth-gates";
import * as z from "zod";
import { ArcaFieldsSchema } from "@/schemas";
import { ArcaUpdateInput, ArcaData } from "@/models/Arca";

const authorizeArcaBusiness = async (
  session: { user: { id: string; role: UserRole; businessId: string | null } },
  businessId: string,
  tenantError: string,
): Promise<{ success: true; actor: AuthenticatedUserContext } | { error: string }> => {
  if (session.user.role === UserRole.ADMIN && session.user.businessId !== businessId) {
    return { error: tenantError };
  }

  const targetBusiness = await db.business.findUnique({
    where: { id: businessId },
    select: { id: true, accountStatus: true },
  });
  if (!targetBusiness) return { error: "Negocio no encontrado" };

  const actor: AuthenticatedUserContext = {
    id: session.user.id,
    role: session.user.role,
    businessId: targetBusiness.id,
    business: { accountStatus: targetBusiness.accountStatus, features: {} },
  };
  const feature = await requireFeature("hasAfipBilling", actor);
  if (!feature.success) return { error: feature.error || "Esta función no está habilitada en tu plan actual." };
  return { success: true, actor: feature.data };
};

export const updateBusinessArcaData = async (
  businessId: string,
  values: z.infer<typeof ArcaFieldsSchema>
): Promise<{ success?: string; error?: string }> => {
  const session = await auth();
  if (!session || (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.ADMIN)) {
    return { error: "No autorizado" };
  }
  if (!session.user.id) return { error: "No autorizado" };

  const authorization = await authorizeArcaBusiness(
    { user: { id: session.user.id, role: session.user.role as UserRole, businessId: session.user.businessId } },
    businessId,
    "No autorizado para modificar otro negocio",
  );
  if ("error" in authorization) return authorization;

  const validatedFields = ArcaFieldsSchema.safeParse(values);
  if (!validatedFields.success) return { error: "Campos inválidos" };

  const { cuit: rawCuit, razonSocial, inicioActividades, condicionIva, cert, key, ptoVenta } = validatedFields.data;
  const cuit = rawCuit.replace(/\D/g, "");

  try {
    const updateData: ArcaUpdateInput = { cuit, razonSocial, inicioActividades, condicionIva, ptoVenta };
    if (cert) updateData.cert = encrypt(cert);
    if (key) updateData.key = encrypt(key);

    await db.business.update({ where: { id: businessId }, data: updateData });
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
  if (!session.user.id) return { error: "No autorizado" };

  const authorization = await authorizeArcaBusiness(
    { user: { id: session.user.id, role: session.user.role as UserRole, businessId: session.user.businessId } },
    businessId,
    "No autorizado para ver otro negocio",
  );
  if ("error" in authorization) return authorization;

  try {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { cuit: true, razonSocial: true, inicioActividades: true, condicionIva: true, cert: true, key: true, ptoVenta: true },
    });
    if (!business) return { error: "Negocio no encontrado" };

    return {
      success: {
        ...business,
        cert: business.cert ? "CONFIGURADO" : null,
        key: business.key ? "CONFIGURADO" : null,
      },
    };
  } catch (error) {
    console.error("Get ARCA Data Error:", error);
    return { error: "Error al obtener datos de ARCA" };
  }
};
