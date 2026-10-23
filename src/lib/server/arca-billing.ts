import { db } from "@/lib/db";
import { parseAfipPointSaleError } from "@/services/afip/point-sale-validation";
import type { AfipVoucherType } from "@/services/afip/point-sale-validation";
import type { AfipPointSaleError } from "@/services/afip/point-sale-validation";
import { validatePointSaleRequest } from "@/services/afip/point-sale-validation";
import { z } from "zod";

export interface BillingActor {
  businessId: string;
  role: string;
}

export interface VoucherNumberResult {
  success?: number;
  /** Kept as a string for existing consumers. */
  error?: string;
  /** Structured context for new consumers and support diagnostics. */
  errorDetails?: AfipPointSaleError;
}

type VoucherOperation = "invoice" | "credit-note";

export interface CreditNoteBillingPreflightInput {
  businessId: string;
  tipoFactura: number;
}

export type CreditNoteBillingPreflightResult =
  | { success: true; emissionPointOfSale: number }
  | { success: false; error: string };

function isValidHttpEndpoint(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "http:" || endpoint.protocol === "https:";
  } catch {
    return false;
  }
}

const voucherRequestSchema = z.object({
  puntoVenta: z.number().int().positive(),
  tipoFactura: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(8), z.literal(11), z.literal(13)]),
});
const creditNotePreflightSchema = z.object({
  businessId: z.string().min(1),
  tipoFactura: z.union([z.literal(3), z.literal(8), z.literal(13)]),
});

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Checks persisted tenant eligibility and local ARCA configuration only.
 * This deliberately does not call getLastVoucher or createVoucher: the former
 * is a remote read and is performed once by the issuance action, while the
 * latter is the irreversible issuance request.
 */
export async function preflightCreditNoteBillingConfiguration(
  input: CreditNoteBillingPreflightInput,
): Promise<CreditNoteBillingPreflightResult> {
  const parsedRequest = creditNotePreflightSchema.safeParse(input);
  if (!parsedRequest.success) {
    return { success: false, error: "La configuración de ARCA para la Nota de Crédito no es válida" };
  }

  try {
    const business = await db.business.findUnique({
      where: { id: input.businessId },
      select: {
        id: true,
        cuit: true,
        cert: true,
        key: true,
        ptoVenta: true,
        features: { select: { hasAfipBilling: true } },
      },
    });

    if (!business || business.id !== input.businessId) {
      return { success: false, error: "No se encontró la configuración de ARCA del negocio" };
    }
    if (business.features?.hasAfipBilling !== true) {
      return { success: false, error: "La facturación AFIP/ARCA no está habilitada para este negocio" };
    }
    if (typeof business.cuit !== "string" || !/^\d{11}$/.test(business.cuit)
      || typeof business.cert !== "string" || !business.cert.trim()
      || typeof business.key !== "string" || !business.key.trim()) {
      return { success: false, error: "La configuración de CUIT y credenciales de AFIP/ARCA está incompleta" };
    }
    if (!Array.isArray(business.ptoVenta) || business.ptoVenta.length === 0) {
      return { success: false, error: "No hay puntos de venta configurados para AFIP/ARCA" };
    }

    const emissionPointOfSale: unknown = business.ptoVenta[0];
    if (!isPositiveSafeInteger(emissionPointOfSale)
      || !business.ptoVenta.includes(emissionPointOfSale)) {
      return { success: false, error: "El primer punto de venta configurado para AFIP/ARCA no es válido" };
    }

    try {
      validatePointSaleRequest(
        { ptoVenta: emissionPointOfSale, tipoFactura: parsedRequest.data.tipoFactura },
        business.ptoVenta,
        "credit-note",
      );
    } catch {
      return { success: false, error: "El punto de venta o tipo de Nota de Crédito no está configurado para AFIP/ARCA" };
    }

    if (!process.env.AFIP_SDK_ACCESS_TOKEN || !process.env.INTERNAL_AFIP_API_KEY) {
      return { success: false, error: "Falta configuración de acceso interno para AFIP/ARCA" };
    }
    if (!isValidHttpEndpoint(process.env.NEXT_PUBLIC_AFIP_FUNCTION_URL)
      || !isValidHttpEndpoint(process.env.NEXT_PUBLIC_GET_LAST_VOUCHER_URL)) {
      return { success: false, error: "La URL del servicio AFIP/ARCA no está configurada correctamente" };
    }

    return { success: true, emissionPointOfSale };
  } catch {
    console.error("Credit-note ARCA configuration preflight failed");
    return { success: false, error: "No se pudo validar la configuración de AFIP/ARCA" };
  }
}

/** Trusted internal billing lookup. Callers must derive actor from auth(). */
export async function getArcaCredentialsForBilling(businessId: string) {
  if (!businessId) return { error: "No autorizado" };

  try {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { cuit: true, cert: true, key: true, ptoVenta: true },
    });

    if (!business) return { error: "Negocio no encontrado" };
    if (!business.cuit || !business.cert || !business.key) {
      return { error: "Credenciales de ARCA incompletas. Por favor consulte con soporte." };
    }

    return {
      success: {
        cuit: business.cuit,
        cert: business.cert,
        key: business.key,
        ptoVentas: business.ptoVenta,
      },
    };
  } catch (error) {
    console.error("Get ARCA Credentials Error:", error);
    return { error: "Error al obtener credenciales de ARCA" };
  }
}

/** Trusted internal voucher lookup. This module is server-only, not a Server Action. */
export async function getVoucherNumberForActor(
  puntoVenta: number,
  tipoFactura: number,
  operation: VoucherOperation,
  actor: BillingActor,
): Promise<VoucherNumberResult> {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  const businessId = actor.businessId;
  if (!businessId) return { error: "Usuario sin negocio asignado" };

  const parsedRequest = voucherRequestSchema.safeParse({ puntoVenta, tipoFactura });
  if (!parsedRequest.success) return { error: "Datos de punto de venta o tipo de comprobante inválidos" };

  try {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { cuit: true, cert: true, key: true, ptoVenta: true },
    });

    if (!business || !business.cuit) return { error: "Negocio no encontrado o sin CUIT configurado" };

    // Undefined is accepted only for older fixture adapters; a configured empty
    // list is authoritative and rejects all points of sale.
    const configuredPoints = business.ptoVenta ?? [puntoVenta];
    try {
      validatePointSaleRequest(
        { ptoVenta: parsedRequest.data.puntoVenta, tipoFactura: parsedRequest.data.tipoFactura },
        configuredPoints,
        operation,
      );
    } catch (error: unknown) {
      return { error: error instanceof Error ? error.message : "Punto de venta inválido" };
    }

    if (!business.cert || !business.key) return { error: "Credenciales de ARCA incompletas" };

    const accessToken = process.env.AFIP_SDK_ACCESS_TOKEN;
    if (!accessToken) {
      console.error("AFIP_SDK_ACCESS_TOKEN no configurado");
      return { error: "Error de configuración de acceso" };
    }

    const payload = {
      action: "getLastVoucher",
      puntoVenta: parsedRequest.data.puntoVenta,
      tipoFactura: parsedRequest.data.tipoFactura,
      accessToken,
      encryptedCert: business.cert,
      encryptedKey: business.key,
      arca: { cuit: business.cuit },
    };

    const functionUrl = process.env.NEXT_PUBLIC_GET_LAST_VOUCHER_URL || "http://127.0.0.1:5001/stockia-e90c6/us-central1/getLastVoucherHandler";
    const apiKey = process.env.INTERNAL_AFIP_API_KEY;
    if (!apiKey) {
      console.error("INTERNAL_AFIP_API_KEY no configurado");
      return { error: "Error de configuración de API" };
    }

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": apiKey },
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

    const data = result && typeof result === "object" ? result as Record<string, unknown> : {};
    if (typeof data.lastVoucher === "number") return { success: data.lastVoucher };

    const wrappedData = data.data && typeof data.data === "object"
      ? data.data as Record<string, unknown>
      : undefined;
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
}
