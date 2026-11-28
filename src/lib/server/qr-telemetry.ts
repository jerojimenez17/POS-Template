export type QrTelemetryStage = "grant-create" | "save-consume-ref" | "resolve" | "render";

export type QrTelemetryReason =
  | "claims-invalid"
  | "grant-create-failed"
  | "token-absent"
  | "binding-mismatch"
  | "grant-expired/replayed"
  | "policy-v1-no-ref"
  | "grant-row-missing"
  | "issuer-mismatch"
  | "invoice-binding-mismatch"
  | "payload-invalid"
  | "renderer-failed"
  | "QR-ready";

export type QrTelemetryKind = "verified-url" | "verified-raw" | "legacy-raw" | "none";
export type QrRenderer = "pdf" | "thermal-html" | "qz" | "partial";
export type QrRendererOutcome = "generated" | "failed" | "submitted";

export interface QrTelemetryEvent {
  stage: QrTelemetryStage;
  outcome: "created" | "rejected" | "accepted" | "reference-persisted" | "completed" | "handoff" | QrRendererOutcome;
  reason?: QrTelemetryReason;
  qrKind?: QrTelemetryKind;
  renderer?: QrRenderer;
}

/** Log only reviewed enum values; never pass source data or exceptions here. */
export function logQrTelemetry(event: QrTelemetryEvent): void {
  console.info({ ...event });
}
