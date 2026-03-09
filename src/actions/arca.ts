"use server";

import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { auth } from "../../auth";
import { revalidatePath } from "next/cache";
import { encrypt } from "@/lib/encryption";
import * as z from "zod";
import { ArcaFieldsSchema } from "@/schemas";

export const updateBusinessArcaData = async (
  businessId: string,
  values: z.infer<typeof ArcaFieldsSchema>
) => {
  const session = await auth();

  if (session?.user.role !== UserRole.SUPER_ADMIN) {
    return { error: "No autorizado" };
  }

  const validatedFields = ArcaFieldsSchema.safeParse(values);

  if (!validatedFields.success) {
    return { error: "Campos inválidos" };
  }

  const { cuit, razonSocial, inicioActividades, condicionIva, cert, key } = validatedFields.data;

  try {
    const updateData: any = {
      cuit,
      razonSocial,
      inicioActividades,
      condicionIva,
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

    revalidatePath(`/superadmin/businesses/${businessId}/arca`);
    revalidatePath("/superadmin/businesses");
    
    return { success: "Datos de ARCA actualizados" };
  } catch (error) {
    console.error("ARCA Update Error:", error);
    return { error: "Error al actualizar datos de ARCA" };
  }
};

export const getBusinessArcaData = async (businessId: string) => {
    const session = await auth();

    if (session?.user.role !== UserRole.SUPER_ADMIN) {
        return { error: "No autorizado" };
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
