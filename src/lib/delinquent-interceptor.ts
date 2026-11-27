import { useDelinquentStore } from "@/stores/useDelinquentStore";

/**
 * Wraps a Server Action call and detects DELINQUENT responses.
 * When DELINQUENT is detected:
 *   - Shows the overdue blocker (via Zustand)
 *   - Does NOT show a toast
 *   - Returns the original response so the caller can still handle it
 */
export async function withDelinquentGuard<
  T extends { error?: string; code?: string; success?: boolean }
>(actionCall: Promise<T>): Promise<T> {
  const result = await actionCall;

  if (
    "code" in result &&
    result.code === "DELINQUENT" &&
    "success" in result &&
    result.success === false
  ) {
    useDelinquentStore.getState().triggerBlocker();
    // No toast — the blocker is the notification
  }

  return result;
}
