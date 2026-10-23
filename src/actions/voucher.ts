"use server";

import { auth } from "../../auth";
import { UserRole } from "@prisma/client";
import { getVoucherNumberForActor, type VoucherNumberResult } from "@/lib/server/arca-billing";

// Keep this public Server Action's historical two-argument contract intact.
export const getVoucherNumberAction = async (
  puntoVenta: number,
  tipoFactura: number
): Promise<VoucherNumberResult> => {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || (role !== UserRole.SUPER_ADMIN && role !== UserRole.ADMIN)) {
    return { error: "No autorizado" };
  }
  const businessId = session.user.businessId;
  if (!businessId) return { error: "Usuario sin negocio asignado" };
  return getVoucherNumberForActor(puntoVenta, tipoFactura, "invoice", { businessId, role });
};
