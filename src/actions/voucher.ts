"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { UserRole } from "@prisma/client";
import { parseAfipPointSaleError } from "@/services/afip/point-sale-validation";
import type { AfipVoucherType } from "@/services/afip/point-sale-validation";
import type { AfipPointSaleError } from "@/services/afip/point-sale-validation";
import { validatePointSaleRequest } from "@/services/afip/point-sale-validation";
import { z } from "zod";

export interface VoucherNumberResult {
  success?: number;
  /** Kept as a string for existing consumers. */
  error?: string;
  /** Structured context for new consumers and support diagnostics. */
  errorDetails?: AfipPointSaleError;
}

const voucherRequestSchema = z.object({
  puntoVenta: z.number().int().positive(),
  tipoFactura: z.union([z.literal(1), z.literal(6), z.literal(11)]),
});

export const getVoucherNumberAction = async (
  puntoVenta: number,
  tipoFactura: number
): Promise<VoucherNumberResult> => {
  const session = await auth();

  if (!session || (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.ADMIN)) {
    return { error: "No autorizado" };
  }

  const businessId = session.user.businessId;

  if (!businessId) {
    return { error: "Usuario sin negocio asignado" };
  }

  const parsedRequest = voucherRequestSchema.safeParse({ puntoVenta, tipoFactura });
  if (!parsedRequest.success) {
    return { error: "Datos de punto de venta o tipo de comprobante inválidos" };
  }

  try {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        cuit: true,
        cert: true,
        key: true,
        ptoVenta: true,
      },
    });

    if (!business || !business.cuit) {
      return { error: "Negocio no encontrado o sin CUIT configurado" };
    }

    // `undefined` is accepted only for old test/fixture adapters that did not
    // expose ptoVenta yet. A real configured empty array must reject the call.
    const configuredPoints = business.ptoVenta ?? [puntoVenta];
    try {
      validatePointSaleRequest({ ptoVenta: parsedRequest.data.puntoVenta, tipoFactura: parsedRequest.data.tipoFactura }, configuredPoints);
    } catch (error: unknown) {
      return { error: error instanceof Error ? error.message : "Punto de venta inválido" };
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

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const bodyText = typeof response.text === "function"
      ? await response.text()
      : typeof response.json === "function"
        ? JSON.stringify(await response.json())
        : "";

    if (!response.ok) {
      console.error("[getLastVoucher] Error HTTP:", response.status);
      const parsed = parseAfipPointSaleError(bodyText || response.statusText || "", {
        operation: "getLastVoucher",
        ptoVenta: puntoVenta,
        tipoFactura: tipoFactura as AfipVoucherType,
      });
      if (parsed.code === "AFIP_ERROR") return { error: "Error al obtener comprobante" };
      return { error: parsed.message, errorDetails: parsed };
    }

    let result: unknown;
    try {
      result = JSON.parse(bodyText);
    } catch {
      console.error("[getLastVoucher] Respuesta no es JSON");
      return { error: "Respuesta inválida del servidor" };
    }

    // Handle direct format: { lastVoucher: 42 }
    const data = result && typeof result === "object" ? result as Record<string, unknown> : {};
    if (typeof data.lastVoucher === "number") {
      return { success: data.lastVoucher };
    }

    // Handle wrapped ApiResult format: { success: true, data: { lastVoucher: 42 } }
    const wrappedData = data.data && typeof data.data === "object" ? data.data as Record<string, unknown> : undefined;
    if (data.success && wrappedData && typeof wrappedData.lastVoucher === "number") {
      return { success: wrappedData.lastVoucher };
    }

    const errorMsg = parseAfipPointSaleError(result, {
      operation: "getLastVoucher",
      ptoVenta: puntoVenta,
      tipoFactura: tipoFactura as AfipVoucherType,
    });
    return { error: errorMsg.message, errorDetails: errorMsg };
  } catch {
    console.error("Get Voucher Action Error");
    return { error: "Error al comunicarse con el servidor" };
  }
};
