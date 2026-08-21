"use server";

import { auth } from "../../auth";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

const MAX_ERROR_BODY_LENGTH = 240;
const safeErrorBody = (body: string): string => body
  .replace(/(["']?)(?:cert(?:ificate)?|key|token|password|secret|authorization|api[_ -]?key|accessToken|encryptedCert|encryptedKey)\1\s*[:=]\s*(["']?)[^\s,;}"']+\2/gi, "$1[redacted]$2")
  .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi, "[certificate redacted]")
  .replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_BODY_LENGTH);

export const generateCertsAction = async (
  type: "dev" | "prod",
  cuit: string,
  username: string,
  password: string,
  alias: string,
  businessId?: string
): Promise<{ success?: string; error?: string }> => {
  const session = await auth();

  if (
    !session ||
    (session.user.role !== UserRole.SUPER_ADMIN &&
      session.user.role !== UserRole.ADMIN)
  ) {
    return { error: "No autorizado" };
  }

  if (session.user.role === UserRole.ADMIN && businessId && session.user.businessId !== businessId) {
    return { error: "No autorizado para modificar otro negocio" };
  }

  const targetBusinessId = businessId ?? session.user.businessId;
  if (!targetBusinessId) {
    return { error: "Negocio no especificado" };
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
      console.error("Cloud function error:", response.status, safeErrorBody(errorBody));
      return {
        error: `Error del servidor (${response.status}): ${
          safeErrorBody(errorBody) || "Error desconocido"
        }`,
      };
    }

    const result = await response.json();

    // Handle both wrapped ApiResult format and direct response
    const generated = result.data?.cert && result.data?.key
      ? { cert: result.data.cert, key: result.data.key }
      : result.cert && result.key ? { cert: result.cert, key: result.key } : undefined;

    if (generated) {
      // Persist in the authenticated server action; never return PEM material
      // to the Client Component that initiated generation.
      await db.business.update({
        where: { id: targetBusinessId },
        data: { cert: encrypt(generated.cert), key: encrypt(generated.key) },
      });
      return { success: "Certificados generados y guardados correctamente" };
    }

    return {
      error:
        safeErrorBody(typeof result.error === "string" ? result.error : "") ||
        safeErrorBody(typeof result.details?.message === "string" ? result.details.message : "") ||
        "Error desconocido al generar certificados",
    };
  } catch (error) {
    console.error("Generate Certs Error:", error instanceof Error ? error.name : "unknown");
    return { error: "Error al comunicarse con el servidor de certificados" };
  }
};
