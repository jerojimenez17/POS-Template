"use server";

import axios from "axios";
import { requireFeature } from "@/lib/auth-gates";
import BillState from "@/models/BillState";
import { getArcaCredentialsForBilling } from "./arca";
import { getVoucherNumberAction } from "./voucher";
import {
  formatAfipPointSaleErrorForUser,
  getAfipVoucherTypeCode,
  parseAfipPointSaleError,
  validatePointSaleRequest,
  type AfipPointSaleError,
} from "@/services/afip/point-sale-validation";
import {
  parseAfipVoucherResponse,
  type AfipResponseDiagnostic,
  type AfipVoucherSuccessData,
} from "@/services/afip/voucher-response";

export type CreateAfipVoucherResult =
  | { success: true; data: AfipVoucherSuccessData }
  | { error: string | AfipPointSaleError; diagnostic?: AfipResponseDiagnostic };

/**
 * Returns the effective unit price for a bill line.
 * Uses salePrice as the primary source of truth (handles shortcut products where
 * the cashier typed a price after the product was added with salePrice=0),
 * and falls back to the catalog price when salePrice is 0.
 * Returns 0 only when both are 0 (which is an invalid bill state).
 */
const getEffectiveUnitPrice = (p: { price: number; salePrice: number }): number => {
  if (p.salePrice > 0) return p.salePrice;
  if (p.price > 0) return p.price;
  return 0;
};

/**
 * Server Action to create an AFIP voucher by calling the Firebase Cloud Function.
 * This action validates the user session and uses a shared secret for authentication.
 */
export const createAfipVoucherAction = async (billState: BillState): Promise<CreateAfipVoucherResult> => {
  const featureResult = await requireFeature("hasAfipBilling");
  if (!featureResult.success) {
    return { error: featureResult.error };
  }

  // 1. Get encrypted business credentials
  const credentials = await getArcaCredentialsForBilling();
  if (credentials.error || !credentials.success) {
    return { error: credentials.error || "No se pudieron obtener las credenciales de ARCA" };
  }

  const { cuit, cert, key } = credentials.success;
  const ptoVenta = Number(billState.ptoVenta);
  let tipoFactura: 1 | 6 | 11;
  try {
    tipoFactura = getAfipVoucherTypeCode(billState.billType ?? "");
    validatePointSaleRequest({ ptoVenta, tipoFactura }, credentials.success.ptoVentas ?? [ptoVenta]);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Punto de venta inválido" };
  }

  const preflight = await getVoucherNumberAction(ptoVenta, tipoFactura);
  // getVoucherNumberAction's success is only the last-number lookup. Do not
  // confuse that numeric result with createVoucher's CAE response.
  const preflightFailed = "error" in preflight && Boolean(preflight.error);
  const hasPreflightNumber = typeof preflight.success === "number";
  if (preflightFailed || !hasPreflightNumber) {
    const pointError = preflight.errorDetails ?? parseAfipPointSaleError(preflight.error ?? "No se obtuvo numeración", {
      operation: "getLastVoucher", ptoVenta, tipoFactura,
      environment: process.env.AFIP_ENVIRONMENT === "produccion" ? "produccion" : process.env.AFIP_ENVIRONMENT === "homologacion" ? "homologacion" : "desconocido",
    });
    return { error: pointError.code === "11002" ? pointError : formatAfipPointSaleErrorForUser(pointError) };
  }
  const functionUrl = process.env.NEXT_PUBLIC_AFIP_FUNCTION_URL || "http://localhost:5001/stockia-e90c6/us-central1/createAFIPVoucher";
  const internalKey = process.env.INTERNAL_AFIP_API_KEY;

  if (!internalKey) {
    console.error("Missing INTERNAL_AFIP_API_KEY in environment variables");
    return { error: "Error de configuración de seguridad interna" };
  }

  try {
    const accessToken = process.env.AFIP_SDK_ACCESS_TOKEN;

    if (!accessToken) {
      console.error("AFIP_SDK_ACCESS_TOKEN no configurado");
      return { error: "Error de configuración de acceso" };
    }

    // 2. Call the Cloud Function from the server
     const billStateWithoutPtoVenta = { ...billState };
     delete billStateWithoutPtoVenta.ptoVenta;

    // Strip product data to only essential fields for the external API
    const discount = Number(billStateWithoutPtoVenta.discount) || 0;
    const rawTotal = Number(billStateWithoutPtoVenta.total) || 0;
    const totalWithDiscountProp = Number(billStateWithoutPtoVenta.totalWithDiscount) || 0;

    // Calculate effective total with discount if discount > 0 and totalWithDiscountProp is not set
    const effectiveTotalWithDiscount = totalWithDiscountProp > 0
      ? totalWithDiscountProp
      : (discount > 0 ? Math.round(rawTotal * (1 - discount / 100)) : rawTotal);

    // If there is a discount applied or totalWithDiscount is present, use effectiveTotalWithDiscount as the total sent to AFIP
    const finalTotal = (discount > 0 || totalWithDiscountProp > 0)
      ? effectiveTotalWithDiscount
      : rawTotal;

    // Explicit allow-list: never forward the complete client BillState (in
    // particular CAE/client metadata) to the external function.
    const minimalBillState = {
      id: billStateWithoutPtoVenta.id,
      seller: billStateWithoutPtoVenta.seller,
      typeDocument: billStateWithoutPtoVenta.typeDocument,
      IVACondition: billStateWithoutPtoVenta.IVACondition,
      twoMethods: billStateWithoutPtoVenta.twoMethods,
      secondPaidMethod: billStateWithoutPtoVenta.secondPaidMethod,
      totalSecondMethod: billStateWithoutPtoVenta.totalSecondMethod,
      entrega: billStateWithoutPtoVenta.entrega,
      pago: billStateWithoutPtoVenta.pago,
      billType: billStateWithoutPtoVenta.billType,
      nroAsociado: billStateWithoutPtoVenta.nroAsociado,
      paidMethod: billStateWithoutPtoVenta.paidMethod,
      clientId: billStateWithoutPtoVenta.clientId,
      client: billStateWithoutPtoVenta.client,
      clientIvaCondition: billStateWithoutPtoVenta.clientIvaCondition,
      clientDocumentNumber: billStateWithoutPtoVenta.clientDocumentNumber,
      products: billStateWithoutPtoVenta.products.map((p) => ({
        id: p.id,
        code: p.code,
        description: p.description,
        price: getEffectiveUnitPrice(p),
        salePrice: p.salePrice ?? 0,
        amount: p.amount,
      })),
      // Ensure numeric fields are actually numbers for the cloud function
      discount: discount,
      documentNumber: Number(billStateWithoutPtoVenta.documentNumber) || 0,
      total: finalTotal,
      totalWithDiscount: effectiveTotalWithDiscount,
      // Convert Date to ISO string for JSON serialization
      date: billStateWithoutPtoVenta.date instanceof Date
        ? billStateWithoutPtoVenta.date.toISOString()
        : String(billStateWithoutPtoVenta.date),
    };

    // Validate effective total before calling AFIP — AFIP rejects 0-amount invoices
    // with "alicuota de iva debe ser distinto de cero". This catches the common
    // case where shortcut products (salePrice=0, price=0) were never priced, and
    // also handles a discount that wipes the total to zero.
    const effectiveTotal = Number(
      billStateWithoutPtoVenta.totalWithDiscount ?? billStateWithoutPtoVenta.total
    ) || 0;

    if (effectiveTotal <= 0) {
      return {
        error: "No se puede generar la factura: el monto total debe ser mayor a 0",
      };
    }

    const response = await axios.post(
      functionUrl,
      // Server-to-server exception required by the canonical Cloud Function
      // contract: credentials are sent only in this request, never returned,
      // logged, or included in diagnostics/client results.
      {
        action: "createVoucher",
        encryptedCert: cert,
        encryptedKey: key,
        arca: {
          accessToken,
          cuit,
           puntoVenta: ptoVenta,
           tipoFactura,
        },
        billState: minimalBillState,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": internalKey,
        },
      }
    );

      const parsed = parseAfipVoucherResponse(response.data, {
        status: response.status,
        ptoVenta,
        tipoFactura,
        environment: process.env.AFIP_ENVIRONMENT === "produccion" ? "produccion" : process.env.AFIP_ENVIRONMENT === "homologacion" ? "homologacion" : "desconocido",
      });
      if (parsed.kind === "success") return { success: true, data: parsed.data };
      console.warn("[createVoucher] AFIP response shape", parsed.responseShape);
      if (parsed.kind === "afip-error") return { error: parsed.error, diagnostic: { ...parsed.responseShape, reason: "afip-error" } };
      return { error: parsed.message, diagnostic: { ...parsed.responseShape, reason: "missing-cae" } };
   } catch (error: unknown) {
     let errorMsg: string | AfipPointSaleError = "Error al comunicarse con el servicio de AFIP";
    
     if (axios.isAxiosError(error)) {
        const parsedResponse = parseAfipVoucherResponse(error.response?.data ?? error.message, {
          status: error.response?.status,
          ptoVenta,
          tipoFactura,
          environment: "desconocido",
        });
        if (parsedResponse.kind === "afip-error") {
          console.warn("[createVoucher] AFIP error shape", parsedResponse.responseShape);
          return { error: parsedResponse.error, diagnostic: { ...parsedResponse.responseShape, reason: "afip-error" } };
        }
        const parsed = parseAfipPointSaleError(error.response?.data ?? error.message, {
         operation: "createVoucher", ptoVenta, tipoFactura, environment: "desconocido",
       });
       errorMsg = parsed.code === "11002" ? parsed : parsed.message;
      } else if (error instanceof Error) {
        const parsed = parseAfipPointSaleError(error, {
          operation: "createVoucher", ptoVenta, tipoFactura, environment: "desconocido",
        });
        console.error("[createVoucher] AFIP client failure", {
          code: parsed.code, operation: parsed.operation, ptoVenta: parsed.ptoVenta, tipoFactura: parsed.tipoFactura,
        });
        errorMsg = parsed.code === "11002" ? parsed : parsed.message;
    }
    
     return { error: errorMsg };
  }
};
