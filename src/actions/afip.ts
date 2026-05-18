"use server";

import axios from "axios";
import { auth } from "../../auth";
import { getArcaCredentialsForBilling } from "./arca";
import BillState from "@/models/BillState";

/**
 * Server Action to create an AFIP voucher by calling the Firebase Cloud Function.
 * This action validates the user session and uses a shared secret for authentication.
 */
export const createAfipVoucherAction = async (billState: BillState) => {
  const session = await auth();

  if (!session) {
    return { error: "No autorizado. Inicie sesión para continuar." };
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
    console.log("AFIP SDK API KEY:", process.env.AFIPSDK_API_KEY);
    console.log("Function URL:", functionUrl);
    // 2. Call the Cloud Function from the server
    const { ptoVenta, ...billStateWithoutPtoVenta } = billState;
    const response = await axios.post(
      functionUrl,
      {
        action: "createVoucher",
        encryptedCert: cert,
        encryptedKey: key,
        arca: {
          accessToken: process.env.AFIPSDK_API_KEY,
          cuit,
          puntoVenta: ptoVenta,
        },
        billState: billStateWithoutPtoVenta,
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
