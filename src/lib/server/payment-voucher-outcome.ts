export interface PaymentVoucherIssueFailureOutcome extends Record<string, unknown> {
  paymentRecorded: true;
  voucherStatus: "FAILED" | "UNKNOWN";
  message: string;
  reconciliationRequired?: true;
}

export class PaymentVoucherIssueError extends Error {
  constructor(readonly voucherStatus: "FAILED" | "UNKNOWN") {
    super(voucherStatus === "UNKNOWN"
      ? "No se pudo confirmar el resultado de la factura; el pago quedó registrado"
      : "No se pudo iniciar la factura para este pago; el pago quedó registrado");
    this.name = "PaymentVoucherIssueError";
  }
}

export function paymentVoucherIssueFailureOutcome(error: unknown): PaymentVoucherIssueFailureOutcome {
  const voucherStatus = error instanceof PaymentVoucherIssueError ? error.voucherStatus : "FAILED";
  return {
    paymentRecorded: true,
    voucherStatus,
    message: error instanceof PaymentVoucherIssueError
      ? error.message
      : "No se pudo iniciar la factura para este pago; el pago quedó registrado",
    ...(voucherStatus === "UNKNOWN" ? { reconciliationRequired: true } : {}),
  };
}
