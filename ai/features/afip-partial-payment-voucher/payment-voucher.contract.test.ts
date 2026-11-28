import QRCode from "qrcode";
import { describe, expect, it, vi } from "vitest";

declare global {
  interface ImportMeta {
    glob: <Module>(pattern: string) => Record<string, () => Promise<Module>>;
  }
}

interface Payment {
  id: string;
  businessId: string;
  order: {
    id: string;
    businessId: string;
    total: number;
    client: {
      id: string;
      name?: string;
      documentNumber: string;
      cuit?: string | null;
      ivaCondition: string;
      fiscalDocumentType?: "CUIT" | "DNI" | null;
      fiscalDocumentNumber?: string | null;
    };
    products: Array<{ description: string; amount: number; salePrice: number }>;
    invoice: {
      cae: string | null;
      billType: string | null;
      invoiceNumber: number | null;
    };
  };
  total: number;
  business?: { cuit?: string; ptoVenta?: number[] };
}

interface VoucherDependencies {
  auth: () => Promise<{ user: { id: string; businessId?: string } } | null>;
  repository: {
    findPayment: (id: string, businessId: string) => Promise<Payment | null>;
    isAfipEligible: (businessId: string) => Promise<boolean>;
    claim: (input: { paymentId: string; businessId: string; billType: string; amount: number }) => Promise<{ status: string; attempt: number; acquired: boolean }>;
    persistAuthorized: (input: Record<string, unknown>) => Promise<void>;
    persistFailure: (input: Record<string, unknown>) => Promise<void>;
    getVoucher: (paymentId: string, businessId: string) => Promise<Record<string, unknown> | null>;
    transaction: <T>(callback: () => Promise<T>) => Promise<T>;
  };
  afip: {
    prepare: (invoice: Record<string, unknown>) => Promise<{ ok: true; capability: unknown } | { ok: false; definite: true }>;
    issue: (capability: unknown) => Promise<
      | { kind: "authorized"; total: number; cae: string; invoiceNumber: number; pointOfSale: number; issuedAt: Date }
      | { kind: "rejected" }
      | { kind: "unknown" }
    >;
    reconcile: (paymentId: string) => Promise<{ kind: "authorized"; voucher: Record<string, unknown> } | { kind: "absent" } | { kind: "unresolved" }>;
  };
}

interface PaymentVoucherInvoiceDto extends Record<string, unknown> {
  products: Array<Record<string, unknown>>;
}

interface PaymentVoucherService {
  mapBillType: (billType: string) => number;
  buildInvoice: (payment: Payment, billType: string, ptoVenta: number) => PaymentVoucherInvoiceDto;
  issue: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  reconcile: (input: { cashMovementId: string }) => Promise<Record<string, unknown>>;
  print: (input: { cashMovementId: string }) => Promise<Record<string, unknown>>;
}

async function createService(dependencies: VoucherDependencies): Promise<PaymentVoucherService> {
  const modules = import.meta.glob<{ createPaymentVoucherService: (deps: VoucherDependencies) => PaymentVoucherService }>(
    "/src/lib/server/payment-voucher.ts",
  );
  const loadModule = Object.values(modules)[0];
  if (!loadModule) {
    throw new Error("Expected @/lib/server/payment-voucher to be implemented before running this contract");
  }
  const loadedModule = await loadModule();
  return loadedModule.createPaymentVoucherService(dependencies);
}

const originalOrderInvoice = {
  cae: "ORIGINAL-CAE",
  billType: "Factura B",
  invoiceNumber: 41,
};

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "movement-1",
    businessId: "business-1",
    total: 123,
    business: { ptoVenta: [3, 8] },
    order: {
      id: "order-1",
      businessId: "business-1",
      total: 9000,
      client: { id: "client-1", documentNumber: "20123456789", ivaCondition: "Responsable Inscripto" },
      products: [{ description: "Must not be invoiced", amount: 4, salePrice: 999 }],
      invoice: { ...originalOrderInvoice },
    },
    ...overrides,
  };
}

function dependencies(overrides: Partial<VoucherDependencies> = {}) {
  const state = { inTransaction: false, paymentRowExists: true, createCalls: 0 };
  const mocks = {
    auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-1" } }),
    findPayment: vi.fn().mockImplementation(async (_id: string, businessId: string) =>
      businessId === "business-1" && state.paymentRowExists ? payment() : null,
    ),
    isAfipEligible: vi.fn().mockResolvedValue(true),
    claim: vi.fn().mockResolvedValue({ status: "ISSUING", attempt: 1, acquired: true }),
    persistAuthorized: vi.fn().mockResolvedValue(undefined),
    persistFailure: vi.fn().mockResolvedValue(undefined),
    getVoucher: vi.fn().mockResolvedValue(null),
    transaction: vi.fn(async <T>(callback: () => Promise<T>) => {
      state.inTransaction = true;
      try {
        return await callback();
      } finally {
        state.inTransaction = false;
      }
    }),
    prepare: vi.fn().mockImplementation(async () => {
      expect(state.inTransaction).toBe(false);
      return { ok: true as const, capability: "opaque-prepared-invoice" };
    }),
    issue: vi.fn().mockImplementation(async () => {
      expect(state.inTransaction).toBe(false);
      state.createCalls += 1;
      return {
        kind: "authorized" as const,
        total: 123,
        cae: "12345678901234",
        invoiceNumber: 77,
        pointOfSale: 3,
        issuedAt: new Date("2026-10-01T12:00:00.000Z"),
      };
    }),
    reconcile: vi.fn().mockResolvedValue({ kind: "unresolved" as const }),
  };
  const deps: VoucherDependencies = {
    auth: mocks.auth,
    repository: {
      findPayment: mocks.findPayment,
      isAfipEligible: mocks.isAfipEligible,
      claim: mocks.claim,
      persistAuthorized: mocks.persistAuthorized,
      persistFailure: mocks.persistFailure,
      getVoucher: mocks.getVoucher,
      transaction: mocks.transaction as VoucherDependencies["repository"]["transaction"],
    },
    afip: { prepare: mocks.prepare, issue: mocks.issue, reconcile: mocks.reconcile },
    ...overrides,
  };
  return { deps, mocks, state };
}

describe("payment voucher amount, mapping, and DTO contract", () => {
  // User-entered/stored payment amounts are intentionally normalized to whole
  // pesos. This rounding contract is separate from trusted AFIP evidence.
  it.each([
    [10.5, 11],
    [10.49, 10],
    [0.5, 1],
    [10.005, 10],
  ])("normalizes payment input %s with whole-peso Math.round semantics", async (amount, pesos) => {
    const service = await createService(dependencies().deps);
    const dto = service.buildInvoice(payment({ total: amount }), "Factura A", 3);
    expect(dto.total).toBe(pesos);
    expect(dto.totalWithDiscount).toBe(pesos);
    expect(dto.products).toEqual([expect.objectContaining({ description: "Pago parcial", price: pesos, salePrice: pesos })]);
  });

  it.each([0, -0.01, 0.49, 0.1 + 0.2, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid amount or one that normalizes below one peso: %s",
    async (amount) => {
      const service = await createService(dependencies().deps);
      expect(() => service.buildInvoice(payment({ total: amount }), "Factura A", 3)).toThrow();
    },
  );

  it.each([
    ["Factura A", 1],
    ["Factura B", 6],
    ["Factura C", 11],
  ])("maps the operator-selected %s to AFIP type %i", async (billType, afipType) => {
    const service = await createService(dependencies().deps);
    expect(service.mapBillType(billType)).toBe(afipType);
  });

  it.each(["Remito", "Presupuesto", "Nota de Crédito B", "Factura Z", "1"]) (
    "rejects unsupported or forged invoice type %s",
    async (billType) => {
      const service = await createService(dependencies().deps);
      expect(() => service.mapBillType(billType)).toThrow();
    },
  );

  it("builds one generic line from the movement amount, never from order products or total", async () => {
    const service = await createService(dependencies().deps);
    const dto = service.buildInvoice(payment(), "Factura A", 3);

    expect(dto).toMatchObject({
      billType: "Factura A",
      total: 123,
      totalWithDiscount: 123,
      discount: 0,
      products: [{ description: "Pago parcial", amount: 1, price: 123, salePrice: 123 }],
    });
    expect(dto.products).toHaveLength(1);
    expect(dto.products).not.toContainEqual(expect.objectContaining({ description: "Must not be invoiced" }));
  expect(dto).not.toHaveProperty("businessId", "caller-business");
  });

  it("uses the same whole-peso amount for a legacy movement, invoice, authorization, and persistence", async () => {
    const legacyPayment = payment({ total: 10.005 });
    const { deps, mocks } = dependencies();
    mocks.findPayment.mockResolvedValue(legacyPayment);
    mocks.issue.mockResolvedValue({
      kind: "authorized",
      total: 10,
      cae: "12345678901234",
      invoiceNumber: 79,
      pointOfSale: 3,
      issuedAt: new Date("2026-10-03T12:00:00.000Z"),
    });
    const service = await createService(deps);

    const result = await service.issue({ cashMovementId: "movement-1", billType: "Factura C", ptoVenta: 3 });

    expect(result).toMatchObject({ voucherStatus: "AUTHORIZED" });
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
      total: 10,
      totalWithDiscount: 10,
      products: [expect.objectContaining({ description: "Pago parcial", price: 10, salePrice: 10 })],
    }));
    expect(mocks.claim).toHaveBeenCalledWith(expect.objectContaining({ amount: 10 }));
    expect(mocks.persistAuthorized).toHaveBeenCalledWith(expect.objectContaining({ amount: 10, total: 10 }));
  });

  it("stores and returns the authorized POS and CbteDesde number without substituting a row or sequence preview", async () => {
    const authorizedAt = new Date("2026-11-18T12:00:00.000Z");
    const { deps, mocks } = dependencies();
    const movement = payment({ id: "movement-row-id-1" });
    const persistedAuthorization: Record<string, unknown> = {};
    mocks.findPayment.mockResolvedValue({ ...movement, business: { ptoVenta: [7] } });
    mocks.issue.mockResolvedValue({
      kind: "authorized",
      total: 123,
      cae: "12345678901234",
      invoiceNumber: 42, // authorized response CbteDesde
      pointOfSale: 7, // authorized response PtoVta
      issuedAt: authorizedAt,
    });
    mocks.persistAuthorized.mockImplementation(async (input: Record<string, unknown>) => {
      Object.assign(persistedAuthorization, input);
    });
    const service = await createService(deps);

    await service.issue({ cashMovementId: movement.id, billType: "Factura C", ptoVenta: 7 });

    expect(persistedAuthorization).toEqual(expect.objectContaining({ invoiceNumber: 42, pointOfSale: 7 }));
    mocks.getVoucher.mockResolvedValue({
      status: "AUTHORIZED",
      billType: "Factura C",
      afipVoucherType: 11,
      amount: 123,
      total: 123,
      cae: "12345678901234",
      invoiceNumber: persistedAuthorization?.invoiceNumber,
      pointOfSale: persistedAuthorization?.pointOfSale,
      issuedAt: authorizedAt,
      fiscalSnapshot: {
        recipient: {
          name: "Recipient at authorization",
          ivaCondition: "Consumidor Final",
          documentType: null,
          documentNumber: null,
        },
      },
      currentAttempt: 1,
      sequencePreview: 1,
    });

    const printDto = await service.print({ cashMovementId: movement.id });

    expect(printDto).toMatchObject({ invoiceNumber: 42, pointOfSale: 7 });
    expect(printDto).not.toMatchObject({ invoiceNumber: 1, pointOfSale: 1 });
  });

  it("prints a partial-payment QR from a visually formatted Business CUIT as numeric ARCA payload", async () => {
    const sourcePayment = payment({
      business: { cuit: "30-71234567-8", ptoVenta: [3] },
    });
    const { deps, mocks } = dependencies();
    mocks.findPayment.mockResolvedValue(sourcePayment);
    mocks.getVoucher.mockResolvedValue({
      status: "AUTHORIZED",
      billType: "Factura A",
      afipVoucherType: 1,
      amount: 123,
      total: 123,
      cae: "12345678901234",
      invoiceNumber: 77,
      pointOfSale: 3,
      issuedAt: new Date("2026-10-01T12:00:00.000Z"),
      requestDate: "2026-10-01",
      fiscalSnapshot: {
        recipient: {
          name: "Recipient at issuance",
          ivaCondition: "Consumidor Final",
          documentType: null,
          documentNumber: null,
        },
      },
    });
    const service = await createService(deps);

    const printableDto = await service.print({ cashMovementId: "movement-1" });

    expect(printableDto.qrUrl).toBeTruthy();
    if (typeof printableDto.qrUrl !== "string") {
      throw new Error("Expected the partial-payment print DTO to contain a QR URL");
    }
    expect(printableDto).toMatchObject({
      status: "AUTHORIZED",
      recipient: { documentType: null, documentNumber: null },
    });
    const qrUrl = printableDto.qrUrl;
    expect(qrUrl).toMatch(/^https:\/\/www\.afip\.gob\.ar\/fe\/qr\/\?p=/);
    const encodedPayload = new URL(qrUrl).searchParams.get("p");
    if (!encodedPayload) throw new Error("Expected the verified partial-payment QR URL payload");
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64").toString("utf8")) as Record<string, unknown>;
    expect(payload).toMatchObject({
      ver: 1,
      fecha: "2026-10-01",
      cuit: 30712345678,
      ptoVta: 3,
      tipoCmp: 1,
      nroCmp: 77,
      tipoDocRec: 99,
      nroDocRec: 0,
    });
    expect(typeof payload.cuit).toBe("number");
    expect(Object.keys(payload)).toHaveLength(13);

    const pngDataUrl = await QRCode.toDataURL(qrUrl, { type: "image/png", margin: 0 });
    const pngBase64 = pngDataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+=*)$/)?.[1];
    expect(pngBase64).toBeTruthy();
    expect([...Buffer.from(pngBase64 ?? "", "base64").subarray(0, 8)])
      .toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.persistAuthorized).not.toHaveBeenCalled();
  });
});

describe("payment-scoped issuance and safety contract", () => {
  it("re-fetches by session tenant, ignores forged client context, and issues outside transactions", async () => {
    const { deps, mocks } = dependencies();
    const service = await createService(deps);

    await service.issue({
      cashMovementId: "movement-1",
      billType: "Factura C",
      businessId: "attacker-business",
      amount: 1,
      orderId: "attacker-order",
      cae: "FORGED-CAE",
      ptoVenta: 3,
      pointOfSale: 99,
      products: [{ description: "forged" }],
      credentials: { key: "forged" },
    });

    expect(mocks.findPayment).toHaveBeenCalledWith("movement-1", "business-1");
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ billType: "Factura C", total: 123 }));
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no session", null, false],
    ["no business", { user: { id: "user-1" } }, false],
  ])("does not issue for %s", async (_label, session, shouldIssue) => {
    const { deps, mocks } = dependencies();
    deps.auth = vi.fn().mockResolvedValue(session);
    const service = await createService(deps);

    await expect(service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 })).rejects.toThrow();
    expect(mocks.issue).toHaveBeenCalledTimes(shouldIssue ? 1 : 0);
  });

  it("does not issue for missing or cross-tenant payments", async () => {
    const { deps, mocks, state } = dependencies();
    state.paymentRowExists = false;
    const service = await createService(deps);

    await expect(service.issue({ cashMovementId: "missing", billType: "Factura B", ptoVenta: 3 })).rejects.toThrow();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("rejects a forged parent-order tenant and an ineligible business before issuance", async () => {
    const { deps, mocks } = dependencies();
    mocks.findPayment.mockResolvedValue({
      ...payment(),
      order: { ...payment().order, businessId: "other-business" },
    });
    const service = await createService(deps);
    await expect(service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 })).rejects.toThrow();
    expect(mocks.issue).not.toHaveBeenCalled();

    mocks.findPayment.mockResolvedValue(payment());
    mocks.isAfipEligible.mockResolvedValue(false);
    const result = await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 });
    expect(result).toMatchObject({ paymentRecorded: true, voucherStatus: "FAILED" });
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("preserves the parent order's original invoice metadata", async () => {
    const { deps, mocks } = dependencies();
    const persistedPayment = payment();
    mocks.findPayment.mockResolvedValue(persistedPayment);
    const service = await createService(deps);

    await service.issue({ cashMovementId: "movement-1", billType: "Factura A", ptoVenta: 3 });

    expect(mocks.persistAuthorized).toHaveBeenCalledWith(expect.not.objectContaining({ order: expect.anything() }));
    expect(persistedPayment.order.invoice).toEqual(originalOrderInvoice);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });

  it("validates the proposed POS against the current tenant configuration before any AFIP call", async () => {
    const { deps, mocks } = dependencies();
    const service = await createService(deps);

    await service.issue({ cashMovementId: "movement-1", billType: "Factura A", ptoVenta: 8 });

    expect(mocks.findPayment).toHaveBeenCalledWith("movement-1", "business-1");
    expect(mocks.claim).toHaveBeenCalledWith(expect.objectContaining({ ptoVenta: 8 }));
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ ptoVenta: 8 }));
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["unconfigured", 9],
    ["zero", 0],
    ["fractional", 3.5],
  ])("rejects a %s POS proposal with zero remote calls", async (_label, ptoVenta) => {
    const { deps, mocks } = dependencies();
    const service = await createService(deps);

    await expect(service.issue({
      cashMovementId: "movement-1",
      billType: "Factura A",
      ptoVenta,
    })).resolves.toMatchObject({ paymentRecorded: true, voucherStatus: "FAILED" });

    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("does not prepare or issue when the authenticated business has no configured POS", async () => {
    const { deps, mocks } = dependencies();
    mocks.findPayment.mockResolvedValue({ ...payment(), business: { ptoVenta: [] } });
    const service = await createService(deps);

    await expect(service.issue({
      cashMovementId: "movement-1",
      billType: "Factura C",
      ptoVenta: 3,
    })).resolves.toMatchObject({ paymentRecorded: true, voucherStatus: "FAILED" });

    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("rejects a POS that was offered by stale UI state but is no longer configured", async () => {
    const { deps, mocks } = dependencies();
    mocks.findPayment.mockResolvedValue({ ...payment(), business: { ptoVenta: [8] } });
    const service = await createService(deps);

    await expect(service.issue({
      cashMovementId: "movement-1",
      billType: "Factura B",
      ptoVenta: 3,
    })).resolves.toMatchObject({ paymentRecorded: true, voucherStatus: "FAILED" });

    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("uses the selected POS on a retry and retains it on the new attempt", async () => {
    const { deps, mocks } = dependencies();
    mocks.issue
      .mockResolvedValueOnce({ kind: "rejected" })
      .mockResolvedValueOnce({
        kind: "authorized",
        total: 123,
        cae: "12345678901234",
        invoiceNumber: 78,
        pointOfSale: 8,
        issuedAt: new Date("2026-10-02T12:00:00.000Z"),
      });
    mocks.claim
      .mockResolvedValueOnce({ status: "ISSUING", attempt: 1, acquired: true })
      .mockResolvedValueOnce({ status: "ISSUING", attempt: 2, acquired: true });
    const service = await createService(deps);

    await service.issue({ cashMovementId: "movement-1", billType: "Factura A", ptoVenta: 3 });
    await service.issue({ cashMovementId: "movement-1", billType: "Factura C", ptoVenta: 8, retry: true });

    expect(mocks.claim).toHaveBeenNthCalledWith(2, expect.objectContaining({
      billType: "Factura C",
      amount: 123,
      ptoVenta: 8,
    }));
    expect(mocks.prepare).toHaveBeenNthCalledWith(2, expect.objectContaining({ ptoVenta: 8 }));
  });

  it("forces Factura B's recipient IVA projection to Consumidor Final without changing Client data", async () => {
    const sourcePayment = payment();
    const { deps, mocks } = dependencies();
    mocks.findPayment.mockResolvedValue(sourcePayment);
    const service = await createService(deps);

    await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 });

    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
      clientIvaCondition: "Consumidor Final",
      IVACondition: "Consumidor Final",
    }));
    expect(mocks.persistAuthorized).toHaveBeenCalledWith(expect.objectContaining({
      fiscalSnapshot: expect.objectContaining({ clientIvaCondition: "Consumidor Final" }),
    }));
    expect(sourcePayment.order.client.ivaCondition).toBe("Responsable Inscripto");
  });

  it.each([
    ["CUIT", "20123456789"],
    ["DNI", "00123456"],
  ] as const)("preserves a single Factura A %s identity as text", async (documentType, documentNumber) => {
    const client = {
      id: "client-1",
      name: "Cliente fiscal",
      documentNumber: "legacy-cuit",
      ivaCondition: "Consumidor Final",
      fiscalDocumentType: documentType,
      fiscalDocumentNumber: documentNumber,
    };
    const invoice = await (await createService(dependencies().deps)).buildInvoice({
      ...payment(),
      order: { ...payment().order, client },
    }, "Factura A", 3);

    expect(invoice).toMatchObject({
      clientDocumentType: documentType,
      clientDocumentNumber: documentNumber,
    });
    expect(invoice.clientDocumentNumber).toBe(documentNumber);
    expect(invoice).not.toHaveProperty("cuit");
    expect(invoice).not.toHaveProperty("dni");
  });

  it("uses legacy Client.cuit as a CUIT when no typed identity pair exists", async () => {
    const sourcePayment = payment({
      order: {
        ...payment().order,
        client: {
          ...payment().order.client,
          cuit: "27123456780",
          fiscalDocumentType: null,
          fiscalDocumentNumber: null,
        },
      },
    });
    const service = await createService(dependencies().deps);

    const invoice = service.buildInvoice(sourcePayment, "Factura A", 3);

    expect(invoice).toMatchObject({ clientDocumentType: "CUIT", clientDocumentNumber: "27123456780" });
  });

  it("does not revive a legacy cuit after the persisted Client identity is explicitly cleared", async () => {
    const { deps, mocks } = dependencies();
    const clearedClient = {
      ...payment().order.client,
      cuit: null,
      documentNumber: null,
      fiscalDocumentType: null,
      fiscalDocumentNumber: null,
    };
    mocks.findPayment.mockResolvedValue({
      ...payment(),
      order: { ...payment().order, client: clearedClient },
    });
    const service = await createService(deps);

    await service.issue({ cashMovementId: "movement-cleared", billType: "Factura A", ptoVenta: 3 });

    expect(mocks.claim).toHaveBeenCalledWith(expect.objectContaining({
      recipientSnapshot: expect.objectContaining({ documentType: null, documentNumber: null }),
    }));
    expect(mocks.prepare).toHaveBeenCalledWith(expect.not.objectContaining({ clientDocumentNumber: "20123456789" }));
  });

  it("re-fetches the saved Client for each payment and keeps an earlier authorized recipient snapshot immutable", async () => {
    const { deps, mocks } = dependencies();
    let persistedClient: NonNullable<Payment["order"]["client"]> = {
      ...payment().order.client,
      name: "Cliente antes de editar",
      fiscalDocumentType: "CUIT" as const,
      fiscalDocumentNumber: "20123456789",
    };
    const authorizedVouchers = new Map<string, Record<string, unknown>>();
    mocks.findPayment.mockImplementation(async (id: string) => ({
      ...payment({ id }),
      order: { ...payment().order, client: { ...persistedClient } },
    }));
    mocks.persistAuthorized.mockImplementation(async (input: Record<string, unknown>) => {
      authorizedVouchers.set(String(input.paymentId), {
        status: "AUTHORIZED",
        billType: input.billType,
        afipVoucherType: input.afipVoucherType,
        amount: input.amount,
        total: input.total,
        cae: input.cae,
        invoiceNumber: input.invoiceNumber,
        pointOfSale: input.pointOfSale,
        issuedAt: input.issuedAt,
        fiscalSnapshot: input.fiscalSnapshot,
      });
    });
    mocks.getVoucher.mockImplementation(async (paymentId: string) => authorizedVouchers.get(paymentId) ?? null);
    mocks.issue.mockResolvedValue({
      kind: "authorized",
      total: 123,
      cae: "12345678901234",
      invoiceNumber: 77,
      pointOfSale: 3,
      issuedAt: new Date("2026-10-01T12:00:00.000Z"),
    });
    const service = await createService(deps);

    await service.issue({ cashMovementId: "movement-1", billType: "Factura A", ptoVenta: 3 });
    const authorizedSnapshot = authorizedVouchers.get("movement-1")?.fiscalSnapshot;
    mocks.issue.mockResolvedValueOnce({ kind: "rejected" });
    mocks.issue.mockResolvedValueOnce({ kind: "rejected" });
    persistedClient = {
      ...persistedClient,
      name: "Cliente guardado actualizado",
      fiscalDocumentType: "DNI",
      fiscalDocumentNumber: "00123456",
      cuit: null,
    };
    await service.issue({ cashMovementId: "movement-2", billType: "Factura A", ptoVenta: 3 });
    await service.issue({ cashMovementId: "movement-2", billType: "Factura A", ptoVenta: 3, retry: true });
    await service.issue({ cashMovementId: "movement-3", billType: "Factura A", ptoVenta: 3 });
    const printedFirstVoucher = await service.print({ cashMovementId: "movement-1" });

    expect(mocks.claim).toHaveBeenNthCalledWith(1, expect.objectContaining({
      paymentId: "movement-1",
      recipientSnapshot: expect.objectContaining({ name: "Cliente antes de editar", documentType: "CUIT", documentNumber: "20123456789" }),
    }));
    for (const claimIndex of [2, 3, 4]) {
      expect(mocks.claim).toHaveBeenNthCalledWith(claimIndex, expect.objectContaining({
        paymentId: claimIndex === 4 ? "movement-3" : "movement-2",
        recipientSnapshot: expect.objectContaining({ name: "Cliente guardado actualizado", documentType: "DNI", documentNumber: "00123456" }),
      }));
    }
    expect(authorizedVouchers.get("movement-1")?.fiscalSnapshot).toEqual(authorizedSnapshot);
    expect(printedFirstVoucher).toMatchObject({
      recipient: { name: "Cliente antes de editar", documentType: "CUIT", documentNumber: "20123456789" },
    });
  });

  it("fails safely before issuance when the parent order has no linked Client", async () => {
    const { deps, mocks } = dependencies();
    mocks.findPayment.mockResolvedValue({
      ...payment(),
      order: { ...payment().order, client: null as unknown as Payment["order"]["client"] },
    });
    const service = await createService(deps);

    const result = await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 });
    expect(result).toMatchObject({ paymentRecorded: true, voucherStatus: "FAILED" });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("keeps the committed payment when AFIP gives a definite rejection", async () => {
    const { deps, mocks, state } = dependencies();
    mocks.issue.mockResolvedValue({ kind: "rejected" });
    const service = await createService(deps);

    const result = await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 });

    expect(result).toMatchObject({ paymentRecorded: true, voucherStatus: "FAILED" });
    expect(state.paymentRowExists).toBe(true);
    expect(mocks.persistFailure).toHaveBeenCalled();
  });

  it("allows an explicit revalidated retry after definite failure with a new durable attempt number", async () => {
    const { deps, mocks } = dependencies();
    mocks.issue
      .mockResolvedValueOnce({ kind: "rejected" })
      .mockResolvedValueOnce({
        kind: "authorized",
        total: 123,
        cae: "12345678901234",
        invoiceNumber: 78,
        pointOfSale: 3,
        issuedAt: new Date("2026-10-02T12:00:00.000Z"),
      });
    mocks.claim
      .mockResolvedValueOnce({ status: "ISSUING", attempt: 1, acquired: true })
      .mockResolvedValueOnce({ status: "ISSUING", attempt: 2, acquired: true });
    const service = await createService(deps);

    await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 });
    const retryResult = await service.issue({ cashMovementId: "movement-1", billType: "Factura C", ptoVenta: 3, retry: true });

    expect(mocks.claim).toHaveBeenNthCalledWith(2, expect.objectContaining({ billType: "Factura C", amount: 123 }));
    expect(mocks.issue).toHaveBeenCalledTimes(2);
    expect(retryResult).toMatchObject({ voucherStatus: "AUTHORIZED" });
  });

  it("marks ambiguous remote outcomes UNKNOWN and does not automatically retry", async () => {
    const { deps, mocks } = dependencies();
    mocks.issue.mockResolvedValue({ kind: "unknown" });
    const service = await createService(deps);

    const result = await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 });

    expect(result).toMatchObject({ voucherStatus: "UNKNOWN" });
    expect(mocks.persistFailure).toHaveBeenCalledWith(expect.objectContaining({ status: "UNKNOWN" }));
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });

  it("does not issue again for active or already-authorized payments", async () => {
    const { deps, mocks } = dependencies();
    mocks.claim
      .mockResolvedValueOnce({ status: "ISSUING", attempt: 1, acquired: true })
      .mockResolvedValueOnce({ status: "ISSUING", attempt: 1, acquired: false });
    const service = await createService(deps);
    await Promise.all([
      service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 }),
      service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 }),
    ]);
    expect(mocks.issue).toHaveBeenCalledTimes(1);

    mocks.getVoucher.mockResolvedValue({ status: "AUTHORIZED", cae: "12345678901234", billType: "Factura B" });
    await service.issue({ cashMovementId: "movement-1", billType: "Factura A", ptoVenta: 3 });
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });

  it("treats failure to persist a possible remote success as UNKNOWN, never as retryable failure", async () => {
    const { deps, mocks } = dependencies();
    mocks.persistAuthorized.mockRejectedValue(new Error("database unavailable"));
    const service = await createService(deps);

    const result = await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 });

    expect(result).toMatchObject({ voucherStatus: "UNKNOWN", reconciliationRequired: true });
    expect(mocks.issue).toHaveBeenCalledTimes(1);
    expect(mocks.persistFailure).toHaveBeenCalledWith(expect.objectContaining({ status: "UNKNOWN" }));
  });

  it("records a mismatched trusted total as reconciliation-required, not printable success", async () => {
    const { deps, mocks } = dependencies();
    mocks.issue.mockResolvedValue({
      kind: "authorized",
      total: 122,
      cae: "12345678901234",
      invoiceNumber: 77,
      pointOfSale: 3,
      issuedAt: new Date("2026-10-01T12:00:00.000Z"),
    });
    const service = await createService(deps);

    const result = await service.issue({ cashMovementId: "movement-1", billType: "Factura B", ptoVenta: 3 });

    expect(result).toMatchObject({ voucherStatus: "UNKNOWN", reconciliationRequired: true });
    expect(mocks.persistAuthorized).not.toHaveBeenCalled();
    expect(mocks.persistFailure).toHaveBeenCalledWith(expect.objectContaining({ status: "UNKNOWN" }));
  });

  it("fails closed on incomplete remote reconciliation evidence without issuing a replacement", async () => {
    const { deps, mocks } = dependencies();
    mocks.reconcile.mockResolvedValue({ kind: "authorized", voucher: { cae: "FOUND-CAE", total: 123 } });
    const service = await createService(deps);

    const result = await service.reconcile({ cashMovementId: "movement-1" });

    expect(result).toEqual({ status: "UNKNOWN", reconciliationRequired: true });
    expect(mocks.persistAuthorized).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("prints only the authorized payment voucher and is read-only", async () => {
    const { deps, mocks } = dependencies();
    mocks.getVoucher.mockResolvedValue({
      status: "AUTHORIZED",
      billType: "Factura A",
      afipVoucherType: 1,
      total: 123,
      amount: 123,
      cae: "12345678901234",
      invoiceNumber: 77,
      pointOfSale: 3,
      issuedAt: new Date("2026-10-01T12:00:00.000Z"),
      line: { description: "Pago parcial", amount: 123 },
      fiscalSnapshot: {
        recipient: {
          name: "Recipient at issuance",
          ivaCondition: "Responsable Inscripto",
          documentType: "DNI",
          documentNumber: "00123456",
        },
      },
    });
    mocks.findPayment.mockResolvedValue({
      ...payment(),
      order: {
        ...payment().order,
        client: {
          ...payment().order.client,
          name: "Current Client name after editing",
          ivaCondition: "Consumidor Final",
        },
      },
    });
    const service = await createService(deps);

    const firstPrint = await service.print({ cashMovementId: "movement-1" });
    const secondPrint = await service.print({ cashMovementId: "movement-1" });

    expect(firstPrint).toEqual(secondPrint);
    expect(firstPrint).toMatchObject({ cae: "12345678901234", total: 123 });
    expect(firstPrint).toMatchObject({
      recipient: {
        name: "Recipient at issuance",
        ivaCondition: "Responsable Inscripto",
        documentType: "DNI",
        documentNumber: "00123456",
      },
    });
    expect(firstPrint).not.toHaveProperty("recipient.name", "Current Client name after editing");
    expect(firstPrint).not.toHaveProperty("recipient.documentNumber", "99999999");
    expect(firstPrint).not.toHaveProperty("cae", "ORIGINAL-CAE");
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.persistAuthorized).not.toHaveBeenCalled();
  });

  it("allows an absent document pair while keeping required recipient fields populated", async () => {
    const { deps, mocks } = dependencies();
    mocks.getVoucher.mockResolvedValue({
      status: "AUTHORIZED",
      billType: "Factura B",
      afipVoucherType: 6,
      total: 123,
      amount: 123,
      cae: "12345678901234",
      invoiceNumber: 77,
      pointOfSale: 3,
      issuedAt: new Date("2026-10-01T12:00:00.000Z"),
      fiscalSnapshot: {
        recipient: {
          name: "Recipient at issuance",
          ivaCondition: "Consumidor Final",
          documentType: null,
          documentNumber: null,
        },
      },
    });
    const service = await createService(deps);

    const printableDto = await service.print({ cashMovementId: "movement-1" });
    const recipient = printableDto.recipient as Record<string, unknown>;

    expect(recipient.name).toBe("Recipient at issuance");
    expect(recipient.ivaCondition).toBe("Consumidor Final");
    expect(String(recipient.name).trim()).not.toBe("");
    expect(String(recipient.ivaCondition).trim()).not.toBe("");
    expect(recipient.documentType).toBeNull();
    expect(recipient.documentNumber).toBeNull();
  });

  it.each([
    ["missing recipient snapshot", undefined],
    ["missing recipient record", {}],
    ["empty recipient name", { recipient: { name: "", ivaCondition: "Responsable Inscripto" } }],
    ["whitespace-only recipient name", { recipient: { name: "   ", ivaCondition: "Responsable Inscripto" } }],
    ["malformed recipient name", { recipient: { name: 42, ivaCondition: "Responsable Inscripto" } }],
    ["empty effective IVA condition", { recipient: { name: "Recipient at issuance", ivaCondition: "" } }],
    ["whitespace-only effective IVA condition", { recipient: { name: "Recipient at issuance", ivaCondition: "  " } }],
    ["malformed effective IVA condition", { recipient: { name: "Recipient at issuance", ivaCondition: 42 } }],
  ])("refuses to return an authorized print DTO with %s", async (_description, fiscalSnapshot) => {
    const { deps, mocks } = dependencies();
    mocks.getVoucher.mockResolvedValue({
      status: "AUTHORIZED",
      billType: "Factura A",
      afipVoucherType: 1,
      total: 123,
      amount: 123,
      cae: "12345678901234",
      invoiceNumber: 77,
      pointOfSale: 3,
      issuedAt: new Date("2026-10-01T12:00:00.000Z"),
      ...(fiscalSnapshot === undefined ? {} : { fiscalSnapshot }),
    });
    const service = await createService(deps);

    await expect(service.print({ cashMovementId: "movement-1" })).rejects.toThrow();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty CAE", { cae: "" }],
    ["a malformed CAE", { cae: "not-a-cae" }],
    ["an unsupported bill type", { billType: "Remito" }],
    ["an AFIP type code that does not match the bill type", { afipVoucherType: 6 }],
    ["a nonpositive invoice number", { invoiceNumber: 0 }],
    ["a nonpositive point of sale", { pointOfSale: 0 }],
    ["an invalid issue date", { issuedAt: new Date("invalid") }],
    ["an amount that differs from the payment", { amount: 122, total: 122 }],
  ])("refuses to print an authorized record with %s", async (_description, invalidFields) => {
    const { deps, mocks } = dependencies();
    mocks.getVoucher.mockResolvedValue({
      status: "AUTHORIZED",
      billType: "Factura A",
      afipVoucherType: 1,
      total: 123,
      amount: 123,
      cae: "12345678901234",
      invoiceNumber: 77,
      pointOfSale: 3,
      issuedAt: new Date("2026-10-01T12:00:00.000Z"),
      ...invalidFields,
    });
    const service = await createService(deps);

    await expect(service.print({ cashMovementId: "movement-1" })).rejects.toThrow();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
