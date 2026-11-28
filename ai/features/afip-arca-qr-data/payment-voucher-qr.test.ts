import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPaymentVoucherService,
  type PaymentVoucherDependencies,
  type PaymentVoucherPayment,
} from "@/lib/server/payment-voucher";

const BUSINESS_ID = "business-qr-qa";
const PAYMENT_ID = "payment-qr-qa";
const REQUEST_DATE = "2026-04-09";

function makePayment(): PaymentVoucherPayment {
  return {
    id: PAYMENT_ID,
    businessId: BUSINESS_ID,
    total: 2750,
    order: {
      id: "order-qr-qa",
      businessId: BUSINESS_ID,
      total: 12000,
      date: new Date("2025-02-03T15:00:00.000Z"),
      client: {
        id: "client-qr-qa",
        name: "Cliente de prueba",
        ivaCondition: "Consumidor Final",
        fiscalDocumentType: null,
        fiscalDocumentNumber: null,
      },
      // Poison value verifies that a partial payment never borrows its order CAE.
      invoice: { cae: "98765432109876", billType: "Factura B", invoiceNumber: 808 },
    },
    business: { name: "Comercio QA", ptoVenta: [12], condicionIva: "Responsable Inscripto" },
  };
}

function authorizedVoucher(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "AUTHORIZED",
    billType: "Factura B",
    afipVoucherType: 6,
    amount: 2750,
    total: 2750,
    cae: "12345678901234",
    caeVencimiento: "20261231",
    qrData: "raw-partial-payment-qr",
    invoiceNumber: 345,
    invoicePointOfSale: 12,
    pointOfSale: 12,
    issuedAt: new Date("2026-04-09T16:30:00.000Z"),
    requestDate: new Date(`${REQUEST_DATE}T00:00:00.000Z`),
    fiscalSnapshot: {
      client: "Cliente de pago parcial",
      clientIvaCondition: "Consumidor Final",
      recipient: {
        name: "Cliente de pago parcial",
        ivaCondition: "Consumidor Final",
        documentType: null,
        documentNumber: null,
      },
    },
    attemptHistory: [
      { status: "FAILED", requestDate: new Date("2026-04-08T00:00:00.000Z"), cae: "11111111111111" },
      { status: "PREPARING", requestDate: new Date("2026-04-10T00:00:00.000Z"), cae: "22222222222222" },
    ],
    ...overrides,
  };
}

function createService(overrides: {
  claim?: PaymentVoucherDependencies["repository"]["claim"];
  getVoucher?: PaymentVoucherDependencies["repository"]["getVoucher"];
  prepare?: PaymentVoucherDependencies["afip"]["prepare"];
  issue?: PaymentVoucherDependencies["afip"]["issue"];
  reconcile?: PaymentVoucherDependencies["afip"]["reconcile"];
  onCall?: (name: string, input?: Record<string, unknown>) => void;
} = {}) {
  const onCall = overrides.onCall ?? (() => undefined);
  const dependencies: PaymentVoucherDependencies = {
    auth: async () => ({ user: { id: "user-qr-qa", businessId: BUSINESS_ID } }),
    repository: {
      findPayment: async () => makePayment(),
      isAfipEligible: async () => true,
      claim: overrides.claim ?? (async (input) => {
        onCall("claim", input as unknown as Record<string, unknown>);
        return { status: "PENDING", attempt: 3, acquired: true };
      }),
      markDispatched: async (input) => onCall("markDispatched", input),
      failPreparing: async (input) => onCall("failPreparing", input),
      persistAuthorized: async (input) => onCall("persistAuthorized", input),
      persistFailure: async (input) => onCall("persistFailure", input),
      getVoucher: overrides.getVoucher ?? (async () => null),
      transaction: async <T>(callback: () => Promise<T>) => callback(),
    },
    afip: {
      prepare: overrides.prepare ?? (async (invoice) => {
        onCall("prepare", invoice);
        return { ok: true, capability: "capability-qr-qa" };
      }),
      issue: overrides.issue ?? (async (_capability, onDispatch) => {
        onCall("issue");
        await onDispatch?.();
        return {
          kind: "authorized",
          total: 2750,
          cae: "12345678901234",
          invoiceNumber: 345,
          pointOfSale: 12,
          issuedAt: new Date("2026-04-09T16:30:00.000Z"),
          qrData: "raw-partial-payment-qr",
        };
      }),
      reconcile: overrides.reconcile ?? (async () => ({ kind: "unresolved" })),
    },
  };
  return createPaymentVoucherService(dependencies);
}

function asCivilDate(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === "string" ? value.slice(0, 10) : undefined;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("partial-payment voucher QR request-date and isolation contract", () => {
  it("captures the civil request date before dispatch and persists/uses it for that invoice", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${REQUEST_DATE}T10:15:00.000Z`));
    const events: Array<{ name: string; input?: Record<string, unknown> }> = [];
    const service = createService({
      onCall: (name, input) => {
        events.push({ name, input });
        if (name === "prepare") vi.setSystemTime(new Date("2026-04-10T00:05:00.000Z"));
      },
    });

    const result = await service.issue({ cashMovementId: PAYMENT_ID, billType: "Factura B", ptoVenta: 12 });
    const claim = events.find((event) => event.name === "claim")?.input;
    const invoice = events.find((event) => event.name === "prepare")?.input;

    expect(result.voucherStatus).toBe("AUTHORIZED");
    expect(asCivilDate(claim?.requestDate)).toBe(REQUEST_DATE);
    expect(invoice?.date).toBe(REQUEST_DATE);
    expect(events.findIndex((event) => event.name === "claim"))
      .toBeLessThan(events.findIndex((event) => event.name === "issue"));
    expect(invoice).not.toHaveProperty("CAE");
    expect(invoice).not.toHaveProperty("invoice");
  });

  it("does not POST when persistence of the request-date attempt fails", async () => {
    const post = vi.fn(async () => ({ kind: "rejected" as const }));
    const service = createService({
      claim: async () => { throw new Error("requestDate persistence failed"); },
      issue: post,
    });

    await expect(service.issue({ cashMovementId: PAYMENT_ID, billType: "Factura B", ptoVenta: 12 })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it("projects requestDate from the authorized voucher attempt only and never reads/emits an order CAE", async () => {
    const getVoucher = vi.fn(async (paymentId: string, businessId: string) => {
      expect(paymentId).toBe(PAYMENT_ID);
      expect(businessId).toBe(BUSINESS_ID);
      return authorizedVoucher();
    });
    const issue = vi.fn(async () => ({ kind: "rejected" as const }));
    const reconcile = vi.fn(async () => ({ kind: "unresolved" as const }));
    const service = createService({ getVoucher, issue, reconcile });

    const dto = await service.print({ cashMovementId: PAYMENT_ID });

    expect(dto.status).toBe("AUTHORIZED");
    expect(asCivilDate(dto.requestDate)).toBe(REQUEST_DATE);
    expect(dto.cae).toBe("12345678901234");
    expect(dto.qrData).toBe("raw-partial-payment-qr");
    expect(JSON.stringify(dto)).not.toContain("98765432109876");
    expect(JSON.stringify(dto)).not.toContain("11111111111111");
    expect(JSON.stringify(dto)).not.toContain("22222222222222");
    expect(issue).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("rejects printing from a non-authorized attempt even when it contains QR data", async () => {
    const service = createService({
      getVoucher: async () => authorizedVoucher({ status: "PENDING" }),
    });

    await expect(service.print({ cashMovementId: PAYMENT_ID })).rejects.toThrow(/no está autorizado/i);
  });
});
