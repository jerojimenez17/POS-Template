"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { UserRole } from "@prisma/client";

export const getVoucherNumberAction = async (
  puntoVenta: number,
  tipoFactura: number
): Promise<{ success?: number; error?: string }> => {
  const session = await auth();

  if (!session || (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.ADMIN)) {
    return { error: "No autorizado" };
  }

  const businessId = session.user.businessId;

  if (!businessId) {
    return { error: "Usuario sin negocio asignado" };
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

    if (!business || !business.cuit) {
      return { error: "Negocio no encontrado o sin CUIT configurado" };
    }

    if (!business.cert || !business.key) {
      return { error: "Credenciales de ARCA incompletas" };
    }

    const payload = {
      action: "getLastVoucher",
      encryptedCert: business.cert,
      encryptedKey: business.key,
      arca: {
        cuit: business.cuit,
      },
      puntoVenta,
      tipoFactura,
    };

    const cloudFunctionUrl = process.env.NEXT_PUBLIC_CLOUD_FUNCTION_URL || "https://southamerica-east1-stock-ia-ff5f8.cloudfunctions.net";
    const apiKey = process.env.INTERNAL_AFIP_API_KEY;

    if (!apiKey) {
      console.error("INTERNAL_AFIP_API_KEY no configurado");
      return { error: "Error de configuración de API" };
    }

    const response = await fetch(`${cloudFunctionUrl}/getLastVoucherHandler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error("Cloud function error:", response.status, response.statusText);
      return { error: "Error al obtener comprobante" };
    }

    const result = await response.json();

    if (result.success && result.data && typeof result.data.lastVoucher === "number") {
      return { success: result.data.lastVoucher };
    }

    return { error: result.error || "Error desconocido al obtener el comprobante" };
  } catch (error) {
    console.error("Get Voucher Action Error:", error);
    return { error: "Error al comunicarse con el servidor" };
  }
};
