"use server";

import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { auth } from "@/auth";
import { assertWritePermission } from "@/lib/auth-gates";
import {
  supplierExcelColumnMappingSchema,
  type SupplierExcelColumnMapping,
} from "@/lib/supplier-excel-column-mapping";

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

export const getSupplierExcelColumnMapping = async (
  supplierId: string,
): Promise<{ mapping?: SupplierExcelColumnMapping | null; error?: string }> => {
  try {
    const businessId = (await auth())?.user?.businessId;
    if (!businessId) return { error: "No autorizado" };
    if (!supplierId?.trim()) return { error: "Proveedor no encontrado o no autorizado" };

    const supplier = await db.supplier.findFirst({
      where: { id: supplierId.trim(), businessId },
      select: { excelColumnMapping: true },
    });
    if (!supplier) return { error: "Proveedor no encontrado o no autorizado" };
    if (supplier.excelColumnMapping === null) return { mapping: null };

    const parsed = supplierExcelColumnMappingSchema.safeParse(supplier.excelColumnMapping);
    return parsed.success
      ? { mapping: parsed.data }
      : { error: "La configuración de columnas del proveedor no es válida" };
  } catch (error) {
    console.error("Error al obtener el mapeo Excel del proveedor:", error);
    return { error: "Error al obtener la configuración de columnas del proveedor" };
  }
};

export const saveSupplierExcelColumnMapping = async (
  supplierId: string,
  mapping: SupplierExcelColumnMapping,
): Promise<{ success?: boolean; error?: string }> => {
  try {
    const businessId = (await auth())?.user?.businessId;
    if (!businessId) return { error: "No autorizado" };
    if (!supplierId?.trim()) return { error: "Proveedor no encontrado o no autorizado" };

    const parsed = supplierExcelColumnMappingSchema.safeParse(mapping);
    if (!parsed.success) return { error: "La configuración de columnas no es válida" };
    const supplier = await db.supplier.findFirst({
      where: { id: supplierId.trim(), businessId },
      select: { id: true },
    });
    if (!supplier) return { error: "Proveedor no encontrado o no autorizado" };

    await db.supplier.update({
      where: { id: supplier.id },
      data: { excelColumnMapping: parsed.data },
    });
    return { success: true };
  } catch (error) {
    console.error("Error al guardar el mapeo Excel del proveedor:", error);
    return { error: "Error al guardar la configuración de columnas del proveedor" };
  }
};
