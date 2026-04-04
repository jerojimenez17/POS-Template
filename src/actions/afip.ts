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
    // 2. Call the Cloud Function from the server
    const response = await axios.post(
      functionUrl,
      {
        action: "createVoucher",
        cuit,
        encryptedCert: cert,
        encryptedKey: key,
        billState,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": internalKey,
        },
      }
    );

    return { success: true, data: response.data };
  } catch (error: any) {
    console.error("Cloud Function Error:", error.response?.data || error.message);
    const errorMsg = error.response?.data?.error || error.message || "Error al comunicarse con el servicio de AFIP";
    return { error: errorMsg };
  }
};
