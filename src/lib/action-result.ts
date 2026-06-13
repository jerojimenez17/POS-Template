export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; code?: ErrorCode };

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "DELINQUENT"
  | "FORBIDDEN"
  | "LIMIT_EXCEEDED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export const ok = <T>(data?: T, message?: string): ActionResult<T> => ({
  success: true,
  data,
  message,
});

export const fail = (error: string, code?: ErrorCode): ActionResult<never> => ({
  success: false,
  error,
  code,
});
