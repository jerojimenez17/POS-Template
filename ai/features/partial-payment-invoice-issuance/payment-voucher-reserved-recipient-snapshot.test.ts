// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createPaymentVoucherService,
  type PaymentVoucherDependencies,
  type PaymentVoucherPayment,
} from "@/lib/server/payment-voucher";

const reservedRecipient = {
  name: "Cliente al confirmar",
  ivaCondition: "Consumidor Final",
  documentType: "CUIT" as const,
  documentNumber: "20123456789",
};

describe("snapshot de destinatario reservado para el pago", () => {
  it("usa el único snapshot PREPARING tanto en el request como en el intento, aunque el cliente cambie antes de emitir", async () => {
    const payment: PaymentVoucherPayment = {
      id: "movement-snapshot",
      businessId: "business-1",
      total: 123,
      paidMethod: "efectivo",
      business: { ptoVenta: [7] },
      order: {
        id: "order-1",
        businessId: "business-1",
        total: 500,
        date: new Date("2026-06-01T10:00:00.000Z"),
        client: {
          id: "client-1",
          name: "Cliente modificado después de reservar",
          ivaCondition: "Monotributista",
          fiscalDocumentType: "DNI",
          fiscalDocumentNumber: "99887766",
        },
      },
    };
    const prepare = vi.fn().mockResolvedValue({ ok: true as const, capability: "prepared-request" });
    const claim = vi.fn().mockResolvedValue({ status: "PENDING", attempt: 1, acquired: true });
    const issue = vi.fn(async (_capability: unknown, onDispatch?: () => Promise<void>) => {
      await onDispatch?.();
      // A definitive rejection ends the test flow without claiming an
      // authoritative authorization or reconciliation result from a mock.
      return { kind: "rejected" as const };
    });
    const dependencies: PaymentVoucherDependencies = {
      auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-1" } }),
      repository: {
        findPayment: vi.fn().mockResolvedValue(payment),
        isAfipEligible: vi.fn().mockResolvedValue(true),
        claim,
        markDispatched: vi.fn().mockResolvedValue(undefined),
        persistAuthorized: vi.fn().mockResolvedValue(undefined),
        persistFailure: vi.fn().mockResolvedValue(undefined),
        getVoucher: vi.fn().mockResolvedValue({
          status: "PENDING",
          amount: 123,
          billType: "Factura B",
          invoicePointOfSale: 7,
          currentAttempt: 1,
          currentAttemptStatus: "PREPARING",
          currentRecipientSnapshot: reservedRecipient,
        }),
        transaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
      },
      afip: {
        prepare,
        issue,
        reconcile: vi.fn().mockResolvedValue({ kind: "unresolved" }),
      },
    };

    const service = createPaymentVoucherService(dependencies);
    const result = await service.issue({
      cashMovementId: "movement-snapshot",
      billType: "Factura B",
      ptoVenta: 7,
    });

    expect(result).toMatchObject({ paymentRecorded: true, voucherStatus: "FAILED" });
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ recipientSnapshot: reservedRecipient }));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      client: reservedRecipient.name,
      clientIvaCondition: "Consumidor Final",
      clientDocumentType: reservedRecipient.documentType,
      clientDocumentNumber: reservedRecipient.documentNumber,
      recipient: reservedRecipient,
    }));
    expect(prepare.mock.calls[0]?.[0]).not.toMatchObject({
      client: "Cliente modificado después de reservar",
      clientDocumentNumber: "99887766",
    });
    expect(issue).toHaveBeenCalledTimes(1);
  });
});
