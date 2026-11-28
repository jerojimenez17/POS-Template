import { reportQrRendererOutcomeAction } from "@/actions/sales/qr-print";

type Renderer = "pdf" | "thermal-html" | "qz" | "partial";
type Outcome = "generated" | "failed" | "submitted";

/** Telemetry must never interrupt rendering, including stale client action bundles. */
export function reportQrRendererOutcome(renderer: Renderer, outcome: Outcome): void {
  try {
    void reportQrRendererOutcomeAction({ renderer, outcome }).catch(() => undefined);
  } catch {
    // Reporting is optional and cannot affect invoice rendering or handoff.
  }
}
