import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrRetryPaymentVoucherAction } from "@/actions/payment-voucher";
import { issuePaymentVoucherForSession } from "@/lib/server/payment-voucher";

vi.mock("@/lib/server/payment-voucher", () => ({
  issuePaymentVoucherForSession: vi.fn().mockResolvedValue({ paymentRecorded: true, voucherStatus: "AUTHORIZED" }),
  getPaymentVoucherForSession: vi.fn(),
  printPaymentVoucherForSession: vi.fn(),
  reconcilePaymentVoucherForSession: vi.fn(),
}));

describe("payment-voucher action POS proposal boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the selected POS proposal together with the payment and explicit invoice type", async () => {
    const result = await createOrRetryPaymentVoucherAction({
      cashMovementId: "movement-1",
      billType: "Factura A",
      ptoVenta: 8,
    });

    expect(result).toMatchObject({ voucherStatus: "AUTHORIZED" });
    expect(issuePaymentVoucherForSession).toHaveBeenCalledWith({
      cashMovementId: "movement-1",
      billType: "Factura A",
      ptoVenta: 8,
    });
  });

  it("accepts a retry with the currently selected POS, not a prior-attempt POS", async () => {
    await createOrRetryPaymentVoucherAction({
      cashMovementId: "movement-1",
      billType: "Factura C",
      ptoVenta: 9,
      retry: true,
    });

    expect(issuePaymentVoucherForSession).toHaveBeenCalledWith({
      cashMovementId: "movement-1",
      billType: "Factura C",
      ptoVenta: 9,
      retry: true,
    });
  });

  it.each([
    { businessId: "forged-business" },
    { clientDocumentNumber: "forged-document" },
    { amount: 1 },
  ])("rejects caller-supplied trusted context %o without invoking the service", async (forgedFields) => {
    const result = await createOrRetryPaymentVoucherAction({
      cashMovementId: "movement-1",
      billType: "Factura B",
      ptoVenta: 8,
      ...forgedFields,
    });

    expect(result).toMatchObject({ voucherStatus: "FAILED" });
    expect(issuePaymentVoucherForSession).not.toHaveBeenCalled();
  });

  it.each([
    ["validation", "invalid configured POS"],
    ["client resolution", "customer data required"],
    ["reservation", "reservation unavailable"],
  ])("returns a definite FAILED outcome for a pre-dispatch %s failure", async (_phase, message) => {
    vi.mocked(issuePaymentVoucherForSession).mockRejectedValueOnce(new Error(message));

    const result = await createOrRetryPaymentVoucherAction({
      cashMovementId: "movement-pre-dispatch",
      billType: "Factura A",
      ptoVenta: 8,
    });

    expect(result).toMatchObject({ paymentRecorded: true, voucherStatus: "FAILED" });
    expect(result).not.toMatchObject({ voucherStatus: "UNKNOWN", reconciliationRequired: true });
  });

  it("preserves UNKNOWN for an outcome that may have been dispatched and blocks retry", async () => {
    vi.mocked(issuePaymentVoucherForSession).mockResolvedValueOnce({
      paymentRecorded: true,
      voucherStatus: "UNKNOWN",
      reconciliationRequired: true,
    });

    const result = await createOrRetryPaymentVoucherAction({
      cashMovementId: "movement-ambiguous",
      billType: "Factura A",
      ptoVenta: 8,
    });

    expect(result).toMatchObject({ voucherStatus: "UNKNOWN", reconciliationRequired: true });
    expect(result).not.toMatchObject({ voucherStatus: "FAILED" });
  });
});
