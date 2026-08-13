"use server";

import axios from "axios";
import { requireFeature } from "@/lib/auth-gates";
import BillState from "@/models/BillState";
import { getArcaCredentialsForBilling } from "./arca";

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
export const createAfipVoucherAction = async (billState: BillState) => {
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

    console.log("Function URL:", functionUrl);
    // 2. Call the Cloud Function from the server
    const { ptoVenta, ...billStateWithoutPtoVenta } = billState;

    // Strip product data to only essential fields for the external API
    const minimalBillState = {
      ...billStateWithoutPtoVenta,
      products: billStateWithoutPtoVenta.products.map((p) => ({
        id: p.id,
        code: p.code,
        description: p.description,
        price: getEffectiveUnitPrice(p),
        salePrice: p.salePrice ?? 0,
        amount: p.amount,
      })),
      // Ensure numeric fields are actually numbers for the cloud function
      discount: Number(billStateWithoutPtoVenta.discount) || 0,
      documentNumber: Number(billStateWithoutPtoVenta.documentNumber) || 0,
      total: Number(billStateWithoutPtoVenta.total) || 0,
      totalWithDiscount: Number(billStateWithoutPtoVenta.totalWithDiscount) || 0,
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
      {
        action: "createVoucher",
        encryptedCert: cert,
        encryptedKey: key,
        arca: {
          accessToken,
          cuit,
          puntoVenta: Number(ptoVenta) || undefined,
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

    return { success: true, data: response.data };
  } catch (error: unknown) {
    let errorMsg = "Error al comunicarse con el servicio de AFIP";
    
    if (axios.isAxiosError(error)) {
      console.error("Cloud Function Error:", error.response?.data || error.message);
      errorMsg = error.response?.data?.error || error.message || errorMsg;
    } else if (error instanceof Error) {
      console.error("Error:", error.message);
      errorMsg = error.message;
    }
    
    return { error: errorMsg };
  }
};
