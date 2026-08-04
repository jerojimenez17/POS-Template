"use server";

import { auth } from "../../auth";
import { UserRole } from "@prisma/client";

export const generateCertsAction = async (
  type: "dev" | "prod",
  cuit: string,
  username: string,
  password: string,
  alias: string
): Promise<{ success?: { cert: string; key: string }; error?: string }> => {
  const session = await auth();

  if (
    !session ||
    (session.user.role !== UserRole.SUPER_ADMIN &&
      session.user.role !== UserRole.ADMIN)
  ) {
    return { error: "No autorizado" };
  }

  try {
    const apiKey = process.env.INTERNAL_AFIP_API_KEY;
    const accessToken = process.env.AFIP_SDK_ACCESS_TOKEN;

    if (!apiKey) {
      console.error("INTERNAL_AFIP_API_KEY no configurado");
      return { error: "Error de configuración de API" };
    }

    if (!accessToken) {
      console.error("AFIP_SDK_ACCESS_TOKEN no configurado");
      return { error: "Error de configuración de acceso" };
    }

    const functionUrl =
      type === "dev"
        ? process.env.NEXT_PUBLIC_GET_ARCA_TEST_CERTS_URL ||
          "https://getarcatestcertshandler-ixjqmm6mlq-uc.a.run.app"
        : process.env.NEXT_PUBLIC_CREATE_CERT_PROD_URL ||
          "https://createcertprodhandler-ixjqmm6mlq-uc.a.run.app";

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": apiKey,
      },
      body: JSON.stringify({ cuit, username, password, alias, accessToken }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Cloud function error:", response.status, errorBody);
      return {
        error: `Error del servidor (${response.status}): ${
          errorBody || "Error desconocido"
        }`,
      };
    }

    const result = await response.json();

    // Handle both wrapped ApiResult format and direct response
    if (result.data?.cert && result.data?.key) {
      return { success: { cert: result.data.cert, key: result.data.key } };
    }

    if (result.cert && result.key) {
      return { success: { cert: result.cert, key: result.key } };
    }

    return {
      error:
        result.error ||
        result.details?.message ||
        "Error desconocido al generar certificados",
    };
  } catch (error) {
    console.error("Generate Certs Error:", error);
    return { error: "Error al comunicarse con el servidor de certificados" };
  }
};
