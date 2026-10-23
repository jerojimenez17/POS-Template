import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCreditNoteAction } from "@/actions/sales/credit-note";

const {
  authMock,
  prepareAfipVoucherMock,
  issuePreparedAfipVoucherMock,
  getLastVoucherMock,
  createVoucherMock,
  preparedPayloadsMock,
  afipCallOrder,
  dbMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  prepareAfipVoucherMock: vi.fn(),
  issuePreparedAfipVoucherMock: vi.fn(),
  getLastVoucherMock: vi.fn(),
  createVoucherMock: vi.fn(),
  preparedPayloadsMock: new WeakMap<object, { billState: unknown; actor: unknown; lastVoucherNumber: number }>(),
  afipCallOrder: [] as string[],
  dbMock: {
    business: { findUnique: vi.fn() },
    order: { findFirst: vi.fn() },
    saleReturn: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    cashboxSession: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/server/afip-voucher", () => ({
  prepareAfipVoucherForActor: prepareAfipVoucherMock,
  issuePreparedAfipVoucher: issuePreparedAfipVoucherMock,
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const request = {
  orderId: "sale-1",
  idempotencyKey: "credit-note-sale-1",
  confirmed: true as const,
};

const authorizedAfipResponse = {
  success: true,
  data: { cae: "98765432101234", number: 77, ptoVenta: 9 },
};

const authorizedFiscalSnapshot = {
  version: 1,
  source: "AUTHORIZED_VOUCHER",
  billType: "Factura B",
  afipVoucherType: 6,
  issuerIvaCondition: "Responsable Inscripto",
  buyerIvaCondition: "Consumidor Final",
  currency: "ARS",
  total: 100,
  net: 82.64,
  vat: 17.36,
  nonTaxed: 0,
  exempt: 0,
  otherTaxes: 0,
  iva: [{ id: 5, base: 82.64, amount: 17.36 }],
} as const;

const saleOrder = {
  id: "sale-1",
  businessId: "business-1",
  paidStatus: "pago",
  total: 100,
  discountAmount: 0,
  seller: "seller@example.com",
  billType: "Factura B",
  afipVoucherType: 6,
  invoiceNumber: 45,
  invoicePointOfSale: 3,
  CAE: "12345678901234",
  fiscalSnapshot: authorizedFiscalSnapshot,
  clientIvaCondition: "Consumidor Final",
  clientDocumentType: null,
  clientDocumentNumber: null,
  items: [{ id: "line-1", productId: "product-1", code: "P1", description: "Product", quantity: 1, price: 100, costPrice: 60, subTotal: 100 }],
  returns: [] as Array<Record<string, unknown>>,
};

const pendingRecord = {
  id: "return-1",
  kind: "CREDIT_NOTE",
  status: "PENDING" as "PENDING" | "AUTHORIZED",
  idempotencyKey: request.idempotencyKey,
  creditNoteCAE: null as string | null,
  creditNoteNumber: null as number | null,
  creditNotePointOfSale: null as number | null,
};

const committedEffects = {
  returnItems: 0,
  productUpdates: 0,
  stockMovements: 0,
  cashboxUpdates: 0,
  cashMovements: 0,
};
const transactionClients: Array<ReturnType<typeof transactionClient>> = [];
let failCashMovementInNextTransaction = false;
let persistedPointOfSaleConfiguration = [9, 12];

function transactionClient() {
  const transactionRecord = { ...pendingRecord };
  const transactionReturns = [...saleOrder.returns];
  const stagedEffects = {
    returnItems: 0,
    productUpdates: 0,
    stockMovements: 0,
    cashboxUpdates: 0,
    cashMovements: 0,
  };
  let stagedReservation: Record<string, unknown> | null = null;

  return {
    business: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => where.id === "business-1"
        ? { id: "business-1", ptoVenta: [...persistedPointOfSaleConfiguration] }
        : null),
    },
    $queryRaw: vi.fn(async (query: TemplateStringsArray, ...values: unknown[]) => {
      const sql = query.join(" ");
      const scopesExpectedOrder = sql.includes('WHERE "id" =')
        && sql.includes('AND "businessId" =')
        && sql.includes("FOR UPDATE")
        && values[0] === saleOrder.id
        && values[1] === saleOrder.businessId;
      return scopesExpectedOrder ? [{ id: saleOrder.id }] : [];
    }),
    order: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; businessId: string } }) => {
        if (where.id !== saleOrder.id || where.businessId !== saleOrder.businessId) return null;
        return { ...saleOrder, returns: [...transactionReturns] };
      }),
    },
    saleReturn: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        stagedReservation = { ...pendingRecord, ...data, id: pendingRecord.id };
        transactionReturns.push(stagedReservation);
        return stagedReservation;
      }),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(transactionRecord, data);
        return { count: 1 };
      }),
      findUnique: vi.fn(async () => transactionRecord),
    },
    saleReturnItem: { createMany: vi.fn(async () => { stagedEffects.returnItems += 1; return { count: 1 }; }) },
    product: { update: vi.fn(async () => { stagedEffects.productUpdates += 1; return {}; }) },
    stockMovement: { createMany: vi.fn(async () => { stagedEffects.stockMovements += 1; return { count: 1 }; }) },
    cashboxSession: { findFirst: vi.fn().mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" }) },
    cashBox: { update: vi.fn(async () => { stagedEffects.cashboxUpdates += 1; return {}; }) },
    cashMovement: { create: vi.fn(async () => {
      if (failCashMovementInNextTransaction) {
        failCashMovementInNextTransaction = false;
        throw new Error("injected cash movement failure");
      }
      stagedEffects.cashMovements += 1;
      return {};
    }) },
    commit: () => {
      Object.assign(pendingRecord, stagedReservation ?? transactionRecord);
      saleOrder.returns = transactionReturns.map((record) => record.id === pendingRecord.id ? pendingRecord : record);
      for (const key of Object.keys(committedEffects) as Array<keyof typeof committedEffects>) {
        committedEffects[key] += stagedEffects[key];
      }
    },
  };
}

function setActor(role: string) {
  authMock.mockResolvedValue({
    user: { id: "user-1", businessId: "business-1", role, email: "actor@example.com" },
  });
}

function configureEligibleOrder() {
  persistedPointOfSaleConfiguration = [9, 12];
  saleOrder.returns = [];
  failCashMovementInNextTransaction = false;
  transactionClients.length = 0;
  Object.assign(committedEffects, { returnItems: 0, productUpdates: 0, stockMovements: 0, cashboxUpdates: 0, cashMovements: 0 });
  Object.assign(pendingRecord, {
    status: "PENDING",
    creditNoteCAE: null,
    creditNoteNumber: null,
    creditNotePointOfSale: null,
  });
  dbMock.business.findUnique.mockResolvedValue({
    id: "business-1",
    features: { hasAfipBilling: true },
    cuit: "20123456789",
    cert: "encrypted-cert",
    key: "encrypted-key",
    ptoVenta: [9, 12],
  });
  dbMock.order.findFirst.mockResolvedValue(saleOrder);
  dbMock.saleReturn.findFirst.mockResolvedValue(null);
  dbMock.saleReturn.create.mockImplementation(async () => {
    saleOrder.returns.push(pendingRecord);
    return pendingRecord;
  });
  dbMock.saleReturn.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(pendingRecord, data);
    return pendingRecord;
  });
  dbMock.saleReturn.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(pendingRecord, data);
    return { count: 1 };
  });
  dbMock.cashboxSession.findFirst.mockResolvedValue({ id: "session-1", cashboxId: "cashbox-1" });
  getLastVoucherMock.mockResolvedValue({ success: 76 });
  createVoucherMock.mockResolvedValue(authorizedAfipResponse);
  afipCallOrder.length = 0;
  prepareAfipVoucherMock.mockImplementation(async (billState: Record<string, unknown>, actor: Record<string, unknown>) => {
    const billType = String(billState.billType ?? "Factura B");
    const voucherType = billType.endsWith("A") ? 3 : billType.endsWith("C") ? 13 : 8;
    const pointOfSale = billState.ptoVenta;
    afipCallOrder.push("getLastVoucher");
    const lastVoucher = await getLastVoucherMock(pointOfSale, voucherType, "credit-note", {
      businessId: actor.businessId,
      role: actor.role,
    }) as { success?: number; error?: string };
    if (lastVoucher.error || !Number.isSafeInteger(lastVoucher.success)) {
      return { error: lastVoucher.error ?? "Error al obtener comprobante", issuanceNotStarted: true };
    }
    const prepared = Object.freeze(Object.create(null)) as object;
    preparedPayloadsMock.set(prepared, { billState, actor, lastVoucherNumber: lastVoucher.success as number });
    return { success: true, prepared };
  });
  issuePreparedAfipVoucherMock.mockImplementation(async (prepared: object) => {
    const payload = preparedPayloadsMock.get(prepared);
    if (!payload) return { error: "La prevalidación de ARCA ya no está disponible", issuanceNotStarted: true };
    preparedPayloadsMock.delete(prepared);
    afipCallOrder.push("createVoucher");
    return createVoucherMock(payload);
  });
  dbMock.$transaction.mockImplementation(async (callback: (tx: ReturnType<typeof transactionClient>) => unknown) => {
    afipCallOrder.push("saleReturn reservation transaction");
    const transaction = transactionClient();
    transactionClients.push(transaction);
    const result = await callback(transaction) as never;
    transaction.commit();
    if (transactionClients.length === 1) afipCallOrder.push("SaleReturn reservation committed");
    return result;
  });
}

describe("createCreditNoteAction authorization and recovery", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-access-token");
    vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-api-key");
    vi.clearAllMocks();
    configureEligibleOrder();
    setActor("ADMIN");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["USER", "SUPER_ADMIN"])("denies %s before reserving a return or calling AFIP", async (role) => {
    setActor(role);

    const result = await createCreditNoteAction(request);

    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.update).not.toHaveBeenCalled();
    expect(prepareAfipVoucherMock).not.toHaveBeenCalled();
    expect(issuePreparedAfipVoucherMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, code: "UNAUTHORIZED" });
  });

  it("checks the actor's open cashbox session before reservation and AFIP", async () => {
    dbMock.cashboxSession.findFirst.mockResolvedValue(null);

    const result = await createCreditNoteAction(request);

    expect(dbMock.cashboxSession.findFirst).toHaveBeenCalledWith({
      where: { businessId: "business-1", userId: "user-1", status: "OPEN" },
    });
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect(prepareAfipVoucherMock).not.toHaveBeenCalled();
    expect(issuePreparedAfipVoucherMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
  });

  it("rejects when persisted business AFIP billing is disabled before reserving or creating a voucher", async () => {
    dbMock.business.findUnique.mockResolvedValue({
      id: "business-1",
      features: { hasAfipBilling: false },
      cuit: "20123456789",
      cert: "encrypted-cert",
      key: "encrypted-key",
      ptoVenta: [9, 12],
    });

    const result = await createCreditNoteAction(request);

    expect.soft(dbMock.business.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "business-1" },
    }));
    expect.soft(result).toMatchObject({ success: false, code: "NOT_ELIGIBLE" });
    expect.soft(result).toHaveProperty("error", expect.stringMatching(/AFIP|ARCA|factur|habilit|configur/i));
    expect.soft(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect.soft(dbMock.saleReturn.update).not.toHaveBeenCalled();
    expect.soft(dbMock.saleReturn.updateMany).not.toHaveBeenCalled();
    for (const transaction of transactionClients) {
      expect.soft(transaction.saleReturn.create).not.toHaveBeenCalled();
      expect.soft(transaction.saleReturn.updateMany).not.toHaveBeenCalled();
    }
    expect.soft(prepareAfipVoucherMock).not.toHaveBeenCalled();
    expect.soft(issuePreparedAfipVoucherMock).not.toHaveBeenCalled();
    expect.soft(createVoucherMock).not.toHaveBeenCalled();
  });

  it("does not reserve or claim a credit note when getLastVoucher preflight fails", async () => {
    getLastVoucherMock.mockResolvedValue({ error: "Error al obtener comprobante" });

    const result = await createCreditNoteAction(request);

    expect.soft(result).toMatchObject({ success: false, code: "AFIP_ERROR" });
    // The trusted prepare helper performs the read-only last-number preflight;
    // it must stop before reservation or irreversible voucher issuance.
    expect.soft(prepareAfipVoucherMock).toHaveBeenCalledTimes(1);
    expect.soft(getLastVoucherMock).toHaveBeenCalledTimes(1);
    expect.soft(issuePreparedAfipVoucherMock).not.toHaveBeenCalled();
    expect.soft(createVoucherMock).not.toHaveBeenCalled();
    expect.soft(afipCallOrder).toEqual(["getLastVoucher"]);

    expect.soft(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect.soft(dbMock.saleReturn.update).not.toHaveBeenCalled();
    expect.soft(dbMock.saleReturn.updateMany).not.toHaveBeenCalled();
    expect.soft(dbMock.saleReturn.findFirst).toHaveBeenCalledTimes(1);
    expect.soft(transactionClients).toHaveLength(0);
    for (const transaction of transactionClients) {
      expect.soft(transaction.saleReturn.create).not.toHaveBeenCalled();
      expect.soft(transaction.saleReturn.updateMany).not.toHaveBeenCalled();
    }
  });

  it("persists AFIP success before local finalization and resumes a saved response locally", async () => {
    failCashMovementInNextTransaction = true;
    const firstResult = await createCreditNoteAction(request);

    expect(dbMock.saleReturn.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "return-1" },
      data: expect.objectContaining({
        creditNoteCAE: "98765432101234",
        creditNoteNumber: 77,
         creditNotePointOfSale: 9,
        status: "PENDING",
      }),
    }));
    expect(firstResult).toMatchObject({ success: false, pending: true, canFinalizeLocally: true });
    expect(vi.mocked(dbMock.saleReturn.update).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(dbMock.$transaction).mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
    );
    expect(pendingRecord.status).toBe("PENDING");
    expect(pendingRecord).toMatchObject({
      creditNoteCAE: "98765432101234",
      creditNoteNumber: 77,
      creditNotePointOfSale: 9,
    });
    expect(transactionClients).toHaveLength(2);
    expect(transactionClients[0]?.$queryRaw).toHaveBeenCalledTimes(1);
    const [lockQuery, ...lockParameters] = transactionClients[0]?.$queryRaw.mock.calls[0] ?? [];
    expect(lockQuery?.join(" ")).toContain('WHERE "id" =');
    expect(lockQuery?.join(" ")).toContain('AND "businessId" =');
    expect(lockQuery?.join(" ")).toContain("FOR UPDATE");
    expect(lockParameters).toEqual(["sale-1", "business-1"]);
    expect(transactionClients[0]?.order.findFirst).toHaveBeenCalledWith({
      where: { id: "sale-1", businessId: "business-1" },
      include: { returns: true },
    });
    expect(transactionClients[0]?.saleReturn.create).toHaveBeenCalledTimes(1);
    expect(prepareAfipVoucherMock).toHaveBeenCalledTimes(1);
    expect(issuePreparedAfipVoucherMock).toHaveBeenCalledTimes(1);
    expect(createVoucherMock).toHaveBeenCalledTimes(1);
    expect(afipCallOrder.indexOf("getLastVoucher")).toBeLessThan(afipCallOrder.indexOf("saleReturn reservation transaction"));
    expect(afipCallOrder.indexOf("saleReturn reservation transaction")).toBeLessThan(afipCallOrder.indexOf("SaleReturn reservation committed"));
    expect(afipCallOrder.indexOf("SaleReturn reservation committed")).toBeLessThan(afipCallOrder.indexOf("createVoucher"));
    const [preparedBillState, preparedActor] = prepareAfipVoucherMock.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(preparedBillState).toMatchObject({
      billType: "Factura B",
      ptoVenta: 9,
      nroAsociado: 45,
      ptoVentaAsociado: 3,
    });
    expect(preparedActor).toMatchObject({ id: "user-1", businessId: "business-1", role: "ADMIN" });
    expect(getLastVoucherMock).toHaveBeenCalledWith(9, 8, "credit-note", { businessId: "business-1", role: "ADMIN" });
    const preparedHandle = issuePreparedAfipVoucherMock.mock.calls[0]?.[0] as object;
    expect(preparedHandle).toBeDefined();
    expect(Object.isFrozen(preparedHandle)).toBe(true);
    expect(Object.getPrototypeOf(preparedHandle)).toBeNull();
    expect(transactionClients[1]?.saleReturnItem.createMany).toHaveBeenCalledTimes(1);
    expect(transactionClients[1]?.product.update).toHaveBeenCalledTimes(1);
    expect(transactionClients[1]?.stockMovement.createMany).toHaveBeenCalledTimes(1);
    expect(transactionClients[1]?.cashBox.update).toHaveBeenCalledTimes(1);
    expect(transactionClients[1]?.cashMovement.create).toHaveBeenCalledTimes(1);
    expect(committedEffects).toEqual({ returnItems: 0, productUpdates: 0, stockMovements: 0, cashboxUpdates: 0, cashMovements: 0 });

    const retryResult = await createCreditNoteAction(request);

    expect(retryResult).toMatchObject({
      success: true,
      data: { creditNoteCAE: "98765432101234", creditNoteNumber: 77, creditNotePointOfSale: 9 },
    });
    expect(issuePreparedAfipVoucherMock).toHaveBeenCalledTimes(1);
    expect(pendingRecord.status).toBe("AUTHORIZED");
    expect(transactionClients).toHaveLength(3);
    expect(transactionClients[2]?.saleReturnItem.createMany).toHaveBeenCalledTimes(1);
    expect(transactionClients[2]?.product.update).toHaveBeenCalledTimes(1);
    expect(transactionClients[2]?.stockMovement.createMany).toHaveBeenCalledTimes(1);
    expect(transactionClients[2]?.cashBox.update).toHaveBeenCalledTimes(1);
    expect(transactionClients[2]?.cashMovement.create).toHaveBeenCalledTimes(1);
    expect(committedEffects).toEqual({ returnItems: 1, productUpdates: 1, stockMovements: 1, cashboxUpdates: 1, cashMovements: 1 });
  });

  it("rejects a committed reservation when emission POS configuration changes before issuance and re-preflights a later retry", async () => {
    issuePreparedAfipVoucherMock.mockImplementationOnce(async (prepared: object) => {
      // Model the persisted configuration changing after the reservation has
      // committed, as observed by the final guard immediately before issue.
      preparedPayloadsMock.delete(prepared);
      afipCallOrder.push("final issuance guard");
      dbMock.business.findUnique.mockResolvedValue({
        id: "business-1",
        features: { hasAfipBilling: true },
        cuit: "20123456789",
        cert: "encrypted-cert",
        key: "encrypted-key",
        ptoVenta: [12],
      });
      return {
        error: "La configuración del punto de venta cambió antes de emitir",
        issuanceNotStarted: true,
      };
    });

    const changedConfigurationResult = await createCreditNoteAction(request);

    expect.soft(afipCallOrder.indexOf("getLastVoucher")).toBeLessThan(
      afipCallOrder.indexOf("saleReturn reservation transaction"),
    );
    expect.soft(afipCallOrder.indexOf("SaleReturn reservation committed")).toBeLessThan(
      afipCallOrder.indexOf("final issuance guard"),
    );
    expect.soft(prepareAfipVoucherMock).toHaveBeenCalledTimes(1);
    expect.soft(getLastVoucherMock).toHaveBeenCalledTimes(1);
    expect.soft(issuePreparedAfipVoucherMock).toHaveBeenCalledTimes(1);
    expect.soft(createVoucherMock).not.toHaveBeenCalled();
    expect.soft(transactionClients[0]?.saleReturn.create).toHaveBeenCalledTimes(1);
    expect.soft(pendingRecord.status).toBe("REJECTED");
    expect.soft(dbMock.saleReturn.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "return-1", status: "PENDING" },
      data: expect.objectContaining({ status: "REJECTED" }),
    }));
    expect.soft(changedConfigurationResult).toMatchObject({
      success: false,
      code: "AFIP_ERROR",
      error: expect.stringMatching(/configuración.*cambió/i),
    });
    const safeResultMessage = "error" in changedConfigurationResult ? changedConfigurationResult.error : "";
    expect.soft(safeResultMessage).not.toMatch(/encrypted-cert|encrypted-key|test-access-token|test-internal-api-key/i);

    // A definitive non-issuance may be retried with the same idempotency key,
    // but only after restoring valid configuration and repeating preflight.
    dbMock.business.findUnique.mockResolvedValue({
      id: "business-1",
      features: { hasAfipBilling: true },
      cuit: "20123456789",
      cert: "encrypted-cert",
      key: "encrypted-key",
      ptoVenta: [9, 12],
    });
    const retryResult = await createCreditNoteAction(request);

    expect.soft(retryResult).toMatchObject({ success: true });
    expect.soft(prepareAfipVoucherMock).toHaveBeenCalledTimes(2);
    expect.soft(getLastVoucherMock).toHaveBeenCalledTimes(2);
    expect.soft(getLastVoucherMock).toHaveBeenNthCalledWith(2, 9, 8, "credit-note", {
      businessId: "business-1",
      role: "ADMIN",
    });
    expect.soft(issuePreparedAfipVoucherMock).toHaveBeenCalledTimes(2);
    expect.soft(createVoucherMock).toHaveBeenCalledTimes(1);
    expect.soft(pendingRecord.status).toBe("AUTHORIZED");
  });

  it("aborts reservation when persisted POS changes after getLastVoucher preflight", async () => {
    getLastVoucherMock.mockImplementationOnce(async () => {
      // The read-only preflight succeeded with POS 9. Model the persisted
      // Business row changing immediately afterward, before the reservation
      // transaction performs its own authoritative configuration read.
      persistedPointOfSaleConfiguration = [12];
      return { success: 76 };
    });

    const result = await createCreditNoteAction(request);

    expect.soft(getLastVoucherMock).toHaveBeenCalledTimes(1);
    expect.soft(getLastVoucherMock).toHaveBeenCalledWith(9, 8, "credit-note", {
      businessId: "business-1",
      role: "ADMIN",
    });
    expect.soft(transactionClients).toHaveLength(1);
    expect.soft(transactionClients[0]?.business.findUnique).toHaveBeenCalledWith({
      where: { id: "business-1" },
    });
    const persistedBusinessRead = transactionClients[0]?.business.findUnique.mock.results[0]?.value;
    if (persistedBusinessRead) {
      await expect.soft(persistedBusinessRead).resolves.toMatchObject({
        id: "business-1",
        ptoVenta: [12],
      });
    }
    expect.soft(transactionClients[0]?.saleReturn.create).not.toHaveBeenCalled();
    expect.soft(transactionClients[0]?.saleReturn.updateMany).not.toHaveBeenCalled();
    expect.soft(dbMock.saleReturn.create).not.toHaveBeenCalled();
    expect.soft(dbMock.saleReturn.update).not.toHaveBeenCalled();
    expect.soft(dbMock.saleReturn.updateMany).not.toHaveBeenCalled();
    expect.soft(issuePreparedAfipVoucherMock).not.toHaveBeenCalled();
    expect.soft(createVoucherMock).not.toHaveBeenCalled();
    expect.soft(result).toMatchObject({
      success: false,
      code: "NOT_ELIGIBLE",
      error: expect.stringMatching(/configuración.*punto de venta.*cambió/i),
    });
  });

  it("records a clear authoritative AFIP rejection as definitive non-issuance", async () => {
    createVoucherMock.mockResolvedValue({
      error: "AFIP rechazó el comprobante",
      diagnostic: { reason: "afip-error", status: 400, routes: ["error"], fields: { error: "object" } },
    });

    const result = await createCreditNoteAction(request);

    expect(result).toMatchObject({ success: false, code: "AFIP_ERROR" });
    expect(result).not.toHaveProperty("pending");
    expect(pendingRecord.status).toBe("REJECTED");
    expect(dbMock.saleReturn.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "return-1", status: "PENDING" },
      data: expect.objectContaining({ status: "REJECTED" }),
    }));
    expect(issuePreparedAfipVoucherMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["HTTP 5xx response", () => createVoucherMock.mockResolvedValue({
      error: "Upstream service unavailable",
      diagnostic: { reason: "afip-error", status: 503, routes: [], fields: { error: "string" } },
    })],
    ["timeout/transport failure", () => createVoucherMock.mockRejectedValue(new Error("request timed out"))],
    ["malformed ambiguous response", () => createVoucherMock.mockResolvedValue({
      error: "AFIP response did not include a valid CAE",
      diagnostic: { reason: "missing-cae", status: 200, routes: ["data"], fields: { data: "object" } },
    })],
  ])("keeps %s pending and never invokes AFIP again on retry", async (_description, configureResponse) => {
    configureResponse();

    const firstResult = await createCreditNoteAction(request);
    const retryResult = await createCreditNoteAction(request);

    expect.soft(firstResult).toMatchObject({ success: false, pending: true, canFinalizeLocally: false, code: "PENDING" });
    expect.soft(pendingRecord.status).toBe("PENDING");
    expect.soft(pendingRecord).toMatchObject({ creditNoteCAE: null, creditNoteNumber: null, creditNotePointOfSale: null });
    expect.soft(retryResult).toMatchObject({ success: false, pending: true, canFinalizeLocally: false, code: "PENDING" });
    expect.soft(issuePreparedAfipVoucherMock).toHaveBeenCalledTimes(1);
    expect.soft(createVoucherMock).toHaveBeenCalledTimes(1);
    expect.soft(pendingRecord.status).toBe("PENDING");
    expect.soft(transactionClients[0]?.saleReturn.create).toHaveBeenCalledTimes(1);
  });

  it("rechecks payment eligibility and keeps order access tenant-scoped", async () => {
    dbMock.order.findFirst.mockResolvedValue({ ...saleOrder, paidStatus: "inpago" });

    await createCreditNoteAction(request);

    expect(dbMock.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sale-1", businessId: "business-1" },
    }));
    expect(prepareAfipVoucherMock).not.toHaveBeenCalled();
    expect(issuePreparedAfipVoucherMock).not.toHaveBeenCalled();
    expect(dbMock.saleReturn.create).not.toHaveBeenCalled();
  });
});
