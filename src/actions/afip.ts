"use server";

import axios from "axios";
import { requireFeature } from "@/lib/auth-gates";
import BillState from "@/models/BillState";
import { getArcaCredentialsForBilling } from "./arca";

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

    const minimalBillState = {
      ...billStateWithoutPtoVenta,
      products: billStateWithoutPtoVenta.products.map((p) => ({
        id: p.id,
        code: p.code,
        description: p.description,
        price: p.price,
        salePrice: p.salePrice,
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
