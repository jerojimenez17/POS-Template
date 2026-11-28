"use server";

import { auth } from "@/auth";
import {
  repairConsumedOrphanArcaQrGrant,
  resolveOrderQrPrintDto,
  type ServerPrintQrDto,
} from "@/lib/server/authorized-arca-qr-grant";
import { logQrTelemetry, type QrRenderer, type QrRendererOutcome } from "@/lib/server/qr-telemetry";
import { z } from "zod";

const rendererOutcomeSchema = z.object({
  renderer: z.enum(["pdf", "thermal-html", "qz", "partial"]),
  outcome: z.enum(["generated", "failed", "submitted"]),
}).strict();
const repairOrderIdSchema = z.string().trim().min(1).max(200);

const REPORT_WINDOW_MS = 60_000;
const REPORT_LIMIT = 30;
const MAX_TRACKED_REPORTERS = 2_000;
const rendererReportWindows = new Map<string, number[]>();

function allowRendererReport(userId: string, now: number): boolean {
  const threshold = now - REPORT_WINDOW_MS;
  for (const [id, timestamps] of rendererReportWindows) {
    const active = timestamps.filter((timestamp) => timestamp > threshold);
    if (active.length === 0) rendererReportWindows.delete(id);
    else if (active.length !== timestamps.length) rendererReportWindows.set(id, active);
  }

  let timestamps = rendererReportWindows.get(userId);
  if (!timestamps) {
    if (rendererReportWindows.size >= MAX_TRACKED_REPORTERS) {
      const oldestId = rendererReportWindows.keys().next().value;
      if (oldestId !== undefined) rendererReportWindows.delete(oldestId);
    }
    timestamps = [];
    rendererReportWindows.set(userId, timestamps);
  }
  if (timestamps.length >= REPORT_LIMIT) return false;
  timestamps.push(now);
  return true;
}

/** Resolves persisted, tenant-scoped invoice QR data for browser printing. */
export async function resolveOrderQrPrintDtoAction(orderId: string): Promise<ServerPrintQrDto> {
  return resolveOrderQrPrintDto(orderId);
}

/** Explicit, authenticated recovery for one persisted order; clients provide no QR claims. */
export async function repairOrphanedQrGrantAction(orderId: string): Promise<boolean> {
  const parsedOrderId = repairOrderIdSchema.safeParse(orderId);
  if (!parsedOrderId.success) return false;
  return repairConsumedOrphanArcaQrGrant(parsedOrderId.data);
}

/** Privacy-bounded renderer telemetry; client input is never echoed or logged. */
export async function reportQrRendererOutcomeAction(input: unknown): Promise<{ success: boolean }> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false };
    const parsed = rendererOutcomeSchema.safeParse(input);
    if (!parsed.success || !allowRendererReport(userId, Date.now())) return { success: false };

    const renderer: QrRenderer = parsed.data.renderer;
    const outcome: QrRendererOutcome = parsed.data.outcome;
    logQrTelemetry({ stage: "render", renderer, outcome });
    return { success: true };
  } catch {
    return { success: false };
  }
}
