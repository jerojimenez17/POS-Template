"use server";

import { z } from "zod";
import {
  getPaymentVoucherForSession,
  issuePaymentVoucherForSession,
  printPaymentVoucherForSession,
  reconcilePaymentVoucherForSession,
  type PaymentVoucherStatusDTO,
} from "@/lib/server/payment-voucher";
import { paymentVoucherIssueFailureOutcome } from "@/lib/server/payment-voucher-outcome";

const paymentIdSchema = z.object({ cashMovementId: z.string().min(1).max(200) }).strict();
const issueSchema = z.object({
  cashMovementId: z.string().min(1).max(200),
  billType: z.enum(["Factura A", "Factura B", "Factura C"]),
  ptoVenta: z.number().int().positive(),
  retry: z.boolean().optional(),
}).strict();

export async function createOrRetryPaymentVoucherAction(input: unknown): Promise<Record<string, unknown>> {
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return { paymentRecorded: true, voucherStatus: "FAILED", error: "Los datos del comprobante no son válidos" };
  try {
    const persistedStatus = await getPaymentVoucherForSession({ cashMovementId: parsed.data.cashMovementId });
    // Historical MISSING payments predate the atomic reservation and cannot
    // prove that no remote dispatch occurred. Keep them blocked pending an
    // audited legacy-reconciliation policy.
    if (persistedStatus?.status === "MISSING") {
      return { paymentRecorded: true, voucherStatus: "MISSING" };
    }
    return await issuePaymentVoucherForSession(parsed.data);
  } catch (error: unknown) {
    const outcome = paymentVoucherIssueFailureOutcome(error);
    console.error("[payment-voucher] action denied", {
      code: `PAYMENT_VOUCHER_REQUEST_${outcome.voucherStatus}`,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return outcome;
  }
}

export async function getPaymentVoucherStatusAction(input: unknown): Promise<PaymentVoucherStatusDTO | null> {
  const parsed = paymentIdSchema.safeParse(input);
  if (!parsed.success) return null;
  try {
    return await getPaymentVoucherForSession(parsed.data);
  } catch {
    return null;
  }
}

export async function printPaymentVoucherAction(input: unknown): Promise<Record<string, unknown> | null> {
  const parsed = paymentIdSchema.safeParse(input);
  if (!parsed.success) return null;
  try {
    return await printPaymentVoucherForSession(parsed.data);
  } catch {
    return null;
  }
}

export async function reconcilePaymentVoucherAction(input: unknown): Promise<Record<string, unknown>> {
  const parsed = paymentIdSchema.safeParse(input);
  if (!parsed.success) return { status: "UNKNOWN", reconciliationRequired: true };
  try {
    return await reconcilePaymentVoucherForSession(parsed.data);
  } catch {
    return { status: "UNKNOWN", reconciliationRequired: true };
  }
}
