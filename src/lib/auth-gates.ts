import { auth } from "@/lib/auth";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { getCachedPlan } from "@/lib/plan-resolver";

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

/**
 * Checks whether the current user's plan has a given feature enabled.
 *
 * Instead of reading from the (now deprecated) flat business.features object,
 * resolves the effective plan via getCachedPlan() which merges PlanDefinition
 * defaults with BusinessFeatures overrides — single source of truth.
 *
 * Falls back to "allowed" for sessions without a businessId (tests, edge cases).
 */
export const requireFeature = async (featureName: string): Promise<ActionResult<{ id: string; businessId: string | null; role: string | null; business: { accountStatus: string; features: Record<string, unknown> } | null }>> => {
  const userResult = await assertWritePermission();
  if (!userResult.success) return userResult;

  const { businessId } = userResult.data;

  // Fallback for test/barebones sessions where business is not fully loaded
  if (!businessId) {
    return ok(userResult.data);
  }

  const plan = await getCachedPlan(businessId);
  const isEnabled = (plan as Record<string, unknown>)[featureName];

  if (!isEnabled) {
    return fail("Esta función no está habilitada en tu plan actual.", "FORBIDDEN");
  }

  return ok(userResult.data);
};

/**
 * Checks whether the current user's plan allows a given limit to be exceeded.
 *
 * Uses the same plan resolver as requireFeature — single source of truth
 * for both feature flags and numeric limits.
 *
 * Falls back to "allowed" for sessions without a businessId (tests, edge cases).
 */
export const assertLimit = async (limitName: string, value: number): Promise<ActionResult<{ id: string; businessId: string | null; role: string | null; business: { accountStatus: string; features: Record<string, unknown> } | null }>> => {
  const userResult = await assertWritePermission();
  if (!userResult.success) return userResult;

  const { businessId } = userResult.data;

  // Fallback for test/barebones sessions where business is not fully loaded
  if (!businessId) {
    return ok(userResult.data);
  }

  const plan = await getCachedPlan(businessId);
  const limit = (plan as Record<string, unknown>)[limitName] as number | null | undefined;

  if (limit !== null && limit !== undefined && value >= limit) {
    return fail(
      `Has superado el límite permitido de ${limitName} (${limit}). Mejora tu plan.`,
      "LIMIT_EXCEEDED"
    );
  }

  return ok(userResult.data);
};
