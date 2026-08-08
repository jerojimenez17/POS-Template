"use server";

import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { auth } from "@/auth";
import { assertWritePermission } from "@/lib/auth-gates";

export const createSupplier = async (data: {
  name: string;
  email?: string;
  phone?: string;
  discount?: number;
  iva?: number;
  gain?: number;
}) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error, code: permission.code };

  try {
    const supplier = await db.supplier.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        discount: data.discount || 0,
        iva: data.iva || 0,
        gain: data.gain || 0,
        business: { connect: { id: session.user.businessId } },
      },
    });
    revalidateTag(CACHE_TAGS.STOCK, "max");
    return { success: "Proveedor creado", supplier };
  } catch (error) {
    console.error(error);
    return { error: "Error al crear proveedor" };
  }
};

export const getSuppliers = async () => {
  const session = await auth();
  if (!session?.user?.businessId) return [];

  try {
    const suppliers = await db.supplier.findMany({
      where: { businessId: session.user.businessId },
      orderBy: { name: "asc" },
    });
    return suppliers;
  } catch (error) {
    console.error(error);
    return [];
  }
};
