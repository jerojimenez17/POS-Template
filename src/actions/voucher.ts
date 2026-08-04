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

    const accessToken = process.env.AFIP_SDK_ACCESS_TOKEN;

    if (!accessToken) {
      console.error("AFIP_SDK_ACCESS_TOKEN no configurado");
      return { error: "Error de configuración de acceso" };
    }

    const payload = {
      action: "getLastVoucher",
      puntoVenta,
      tipoFactura,
      accessToken,
      encryptedCert: business.cert,
      encryptedKey: business.key,
      arca: {
        cuit: business.cuit,
      },
    };

    const functionUrl = process.env.NEXT_PUBLIC_GET_LAST_VOUCHER_URL || "https://getlastvoucherhandler-ixjqmm6mlq-uc.a.run.app";
    const apiKey = process.env.INTERNAL_AFIP_API_KEY;

    if (!apiKey) {
      console.error("INTERNAL_AFIP_API_KEY no configurado");
      return { error: "Error de configuración de API" };
    }

    console.log("==========================================");
    console.log("[getLastVoucher] → Enviando a cloud function");
    console.log("[getLastVoucher]   functionUrl:", functionUrl);
    console.log("[getLastVoucher]   puntoVenta:", payload.puntoVenta);
    console.log("[getLastVoucher]   tipoFactura:", payload.tipoFactura);
    console.log("[getLastVoucher]   accessToken:", payload.accessToken ? `${payload.accessToken.substring(0, 8)}...` : "NO ENVIADO");
    console.log("[getLastVoucher]   encryptedCert:", payload.encryptedCert ? `${payload.encryptedCert.substring(0, 40)}...` : "NO ENVIADO");
    console.log("[getLastVoucher]   encryptedKey:", payload.encryptedKey ? `${payload.encryptedKey.substring(0, 40)}...` : "NO ENVIADO");
    console.log("[getLastVoucher]   arca.cuit:", payload.arca?.cuit || "NO ENVIADO");
    console.log("[getLastVoucher]   x-internal-key:", apiKey ? `${apiKey.substring(0, 8)}...` : "NO CONFIGURADO");

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text();
    console.log("[getLastVoucher] ← status:", response.status);
    console.log("[getLastVoucher] ← body crudo:", bodyText.substring(0, 500));
    console.log("==========================================");

    if (!response.ok) {
      console.error("[getLastVoucher] ✘ Error HTTP:", response.status, bodyText);
      return { error: `Error del servidor (${response.status}): ${bodyText.substring(0, 200)}` };
    }

    let result: any;
    try {
      result = JSON.parse(bodyText);
    } catch {
      console.error("[getLastVoucher] ✘ Respuesta no es JSON:", bodyText);
      return { error: "Respuesta inválida del servidor" };
    }

    // Handle direct format: { lastVoucher: 42 }
    if (typeof result.lastVoucher === "number") {
      console.log("[getLastVoucher] ✓ último comprobante:", result.lastVoucher);
      return { success: result.lastVoucher };
    }

    // Handle wrapped ApiResult format: { success: true, data: { lastVoucher: 42 } }
    if (result.success && result.data && typeof result.data.lastVoucher === "number") {
      console.log("[getLastVoucher] ✓ último comprobante (wrapped):", result.data.lastVoucher);
      return { success: result.data.lastVoucher };
    }

    const errorMsg =
      result.error ||
      result.details?.message ||
      result.details?.error ||
      "Error desconocido al obtener el comprobante";
    console.error("[getLastVoucher] ✘ Error respuesta:", JSON.stringify(result));
    return { error: errorMsg };
  } catch (error) {
    console.error("Get Voucher Action Error:", error);
    return { error: "Error al comunicarse con el servidor" };
  }
};
