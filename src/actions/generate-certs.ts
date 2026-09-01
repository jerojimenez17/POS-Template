"use server";

import { Prisma, UserRole } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { z } from "zod";

import { auth } from "../../auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { CACHE_TAGS } from "@/lib/cache-tags";

interface GeneratedCertificates {
  cert: string;
  key: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isGeneratedCertificates = (value: unknown): value is GeneratedCertificates =>
  isRecord(value) && isNonEmptyString(value.cert) && isNonEmptyString(value.key);

const isRejectedWrapper = (value: unknown): boolean =>
  isRecord(value) && value.success === false;

const generateCertsInputSchema = z.tuple([
  z.enum(["dev", "prod"]),
  z.string().regex(/^\d{11}$/, "CUIT inválido"),
  z.string().min(1).max(128),
  z.string().min(1).max(1024),
  z.string().min(1).max(128),
  z.string().min(1).max(128).optional(),
]);

/** Accept only documented provider envelopes; never search recursively. */
const parseGeneratedCertificates = (payload: unknown): GeneratedCertificates | undefined => {
  if (!isRecord(payload) || isRejectedWrapper(payload)) return undefined;
  if (isGeneratedCertificates(payload)) return payload;

  const data = payload.data;
  if (isRejectedWrapper(data)) return undefined;
  if (isGeneratedCertificates(data)) return data;
  if (!isRecord(data)) return undefined;

  const nestedData = data.data;
  if (isRejectedWrapper(nestedData)) return undefined;
  return isGeneratedCertificates(nestedData) ? nestedData : undefined;
};

export const generateCertsAction = async (
  type: unknown,
  cuit: unknown,
  username: unknown,
  password: unknown,
  alias: unknown,
  businessId?: unknown
): Promise<{ success?: string; error?: string }> => {
  const parsedInput = generateCertsInputSchema.safeParse([
    type,
    cuit,
    username,
    password,
    alias,
    businessId,
  ]);

  if (!parsedInput.success) {
    return { error: "Parámetros inválidos" };
  }

  const [validatedType, validatedCuit, validatedUsername, validatedPassword, validatedAlias, validatedBusinessId] =
    parsedInput.data;
  const session = await auth();

  if (
    !session ||
    (session.user.role !== UserRole.SUPER_ADMIN &&
      session.user.role !== UserRole.ADMIN)
  ) {
    return { error: "No autorizado" };
  }

  if (
    session.user.role === UserRole.ADMIN &&
    validatedBusinessId &&
    session.user.businessId !== validatedBusinessId
  ) {
    return { error: "No autorizado para modificar otro negocio" };
  }

  const targetBusinessId = validatedBusinessId ?? session.user.businessId;
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
      validatedType === "dev"
        ? process.env.NEXT_PUBLIC_GET_ARCA_TEST_CERTS_URL ||
          "https://getarcatestcertshandler-ixjqmm6mlq-uc.a.run.app"
        : process.env.NEXT_PUBLIC_CREATE_CERT_PROD_URL ||
          "https://createcertprodhandler-ixjqmm6mlq-uc.a.run.app";

    let result: unknown;
    try {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": apiKey,
        },
        body: JSON.stringify({
          cuit: validatedCuit,
          username: validatedUsername,
          password: validatedPassword,
          alias: validatedAlias,
          accessToken,
        }),
      });

      if (!response.ok) {
        console.error("Cloud function request failed", {
          status: response.status,
          mode: validatedType,
        });
        return { error: `Error del servidor (${response.status})` };
      }

      result = await response.json();
    } catch {
      console.error("Certificate provider communication failed");
      return { error: "Error al comunicarse con el servidor de certificados" };
    }

    const generated = parseGeneratedCertificates(result);

    if (!generated) {
      return { error: "El servidor de certificados rechazó la generación" };
    }

    try {
      await db.business.update({
        where: { id: targetBusinessId },
        data: { cert: encrypt(generated.cert), key: encrypt(generated.key) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return { error: "Negocio no encontrado" };
      }

      console.error(
        "Certificate persistence failed",
        error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "unknown"
      );
      return { error: "Error al guardar los certificados en la base de datos" };
    }

    revalidateTag(CACHE_TAGS.ARCA, "max");

    return { success: "Certificados generados y guardados correctamente" };
  } catch {
    console.error("Certificate generation failed");
    return { error: "Error al comunicarse con el servidor de certificados" };
  }
};
