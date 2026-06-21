import { auth } from "@/lib/auth";
import { ok, fail, type ActionResult } from "@/lib/action-result";

export const assertWritePermission = async (): Promise<ActionResult<{ id: string; businessId: string | null; role: string | null; business: { accountStatus: string; features: Record<string, unknown> } | null }>> => {
  const session = await auth();
  if (!session || !session.user) {
    return fail("Debes iniciar sesión para realizar esta acción.", "UNAUTHENTICATED");
  }

  const business = session.user.business;
  if (business && business.accountStatus === "MOROSO") {
    return fail("Acción bloqueada. Tu cuenta posee facturas vencidas impagas.", "DELINQUENT");
  }

  return ok(session.user as { id: string; businessId: string | null; role: string | null; business: { accountStatus: string; features: Record<string, unknown> } | null });
};

export const requireFeature = async (featureName: string): Promise<ActionResult<{ id: string; businessId: string | null; role: string | null; business: { accountStatus: string; features: Record<string, unknown> } | null }>> => {
  const userResult = await assertWritePermission();
  if (!userResult.success) return userResult;

  const user = userResult.data!;
  const business = user.business;

  // Fallback for test/barebones sessions where business is not fully loaded
  if (!business || !business.features) {
    return ok(user);
  }

  const features = business.features;
  if (!(features as Record<string, unknown>)[featureName]) {
    return fail("Esta función no está habilitada en tu plan actual.", "FORBIDDEN");
  }

  return ok(user);
};

export const assertLimit = async (limitName: string, value: number): Promise<ActionResult<{ id: string; businessId: string | null; role: string | null; business: { accountStatus: string; features: Record<string, unknown> } | null }>> => {
  const userResult = await assertWritePermission();
  if (!userResult.success) return userResult;

  const user = userResult.data!;
  const business = user.business;

  // Fallback for test/barebones sessions where business is not fully loaded
  if (!business || !business.features) {
    return ok(user);
  }

  const features = business.features;
  const limit = (features as Record<string, unknown>)[limitName] as number;
  if (limit !== null && limit !== undefined && value >= limit) {
    return fail(
      `Has superado el límite permitido de ${limitName} (${limit}). Mejora tu plan.`,
      "LIMIT_EXCEEDED"
    );
  }

  return ok(user);
};
