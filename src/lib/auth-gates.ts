import { auth } from "@/lib/auth";

export class FeatureAccessError extends Error {
  constructor(message: string, public code: "UNAUTHENTICATED" | "DELINQUENT" | "FORBIDDEN" | "LIMIT_EXCEEDED") {
    super(message);
    this.name = "FeatureAccessError";
  }
}

export const assertWritePermission = async () => {
  const session = await auth();
  if (!session || !session.user) {
    throw new FeatureAccessError("Debes iniciar sesión para realizar esta acción.", "UNAUTHENTICATED");
  }

  const business = session.user.business;
  if (business && business.accountStatus === "MOROSO") {
    throw new FeatureAccessError("Acción bloqueada. Tu cuenta posee facturas vencidas impagas.", "DELINQUENT");
  }

  return session.user;
};

export const requireFeature = async (featureName: string) => {
  const user = await assertWritePermission();
  const business = user.business;

  // Fallback for test/barebones sessions where business is not fully loaded
  if (!business || !business.features) {
    return user;
  }

  const features = business.features;
  if (!(features as Record<string, unknown>)[featureName]) {
    throw new FeatureAccessError("Esta función no está habilitada en tu plan actual.", "FORBIDDEN");
  }

  return user;
};

export const assertLimit = async (limitName: string, value: number) => {
  const user = await assertWritePermission();
  const business = user.business;

  // Fallback for test/barebones sessions where business is not fully loaded
  if (!business || !business.features) {
    return user;
  }

  const features = business.features;
  const limit = (features as Record<string, unknown>)[limitName] as number;
  if (limit !== null && limit !== undefined && value >= limit) {
    throw new FeatureAccessError(
      `Has superado el límite permitido de ${limitName} (${limit}). Mejora tu plan.`,
      "LIMIT_EXCEEDED"
    );
  }

  return user;
};
