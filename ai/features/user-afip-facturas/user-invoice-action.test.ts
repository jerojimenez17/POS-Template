import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, prepareMock, issueMock, grantMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prepareMock: vi.fn(),
  issueMock: vi.fn(),
  grantMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/server/afip-voucher", () => ({
  prepareAfipVoucherForActor: prepareMock,
  issuePreparedAfipVoucher: issueMock,
}));
vi.mock("@/lib/server/fiscal-snapshot-grant", () => ({
  createAuthorizedFiscalSnapshotGrant: grantMock,
}));

import { createAfipVoucherAction } from "@/actions/afip";

const validSnapshot = (billType: string, afipVoucherType: number) => ({
  version: 1,
  source: "AUTHORIZED_VOUCHER",
  billType,
  afipVoucherType,
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
});

function invoice(billType = "Factura B") {
  return {
    id: "ticket-1",
    seller: "Caja",
    typeDocument: "FACTURA",
    IVACondition: "Responsable Inscripto",
    twoMethods: false,
    billType,
    paidMethod: "Efectivo",
    discount: 0,
    documentNumber: 0,
    total: 100,
    totalWithDiscount: 100,
    date: new Date("2026-10-01T12:00:00.000Z"),
    ptoVenta: 3,
    products: [{ id: "product-1", code: "P1", description: "Producto", price: 100, salePrice: 100, amount: 1 }],
  };
}

function sessionUser(overrides: Record<string, unknown> = {}) {
  return { id: "user-session", role: "USER", businessId: "business-session", ...overrides };
}

describe("createAfipVoucherAction USER invoice authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: sessionUser() });
    prepareMock.mockResolvedValue({ success: true, prepared: Object.freeze({}) });
    issueMock.mockImplementation(async () => ({
      success: true,
      data: {
        cae: "98765432101234",
        vencimiento: "20261015",
        nroComprobante: 77,
        qrData: "qr",
        ptoVenta: 3,
        sourcePath: "data",
        fiscalSnapshot: validSnapshot("Factura B", 6),
      },
    }));
    grantMock.mockResolvedValue("authorized-snapshot-token");
  });

  it.each([
    ["Factura A", 3],
    ["Factura B", 6],
    ["Factura C", 11],
  ] as const)("allows an authenticated USER to issue %s through the trusted path", async (billType, voucherType) => {
    issueMock.mockResolvedValueOnce({
      success: true,
      data: {
        cae: "98765432101234",
        vencimiento: "20261015",
        nroComprobante: 77,
        qrData: "qr",
        ptoVenta: 3,
        sourcePath: "data",
        fiscalSnapshot: validSnapshot(billType, voucherType),
      },
    });

    const result = await createAfipVoucherAction(invoice(billType));

    expect(result).toMatchObject({ success: true, data: { fiscalSnapshotToken: "authorized-snapshot-token" } });
    expect(prepareMock).toHaveBeenCalledWith(
      expect.objectContaining({ billType, ptoVenta: 3, total: 100 }),
      expect.objectContaining({ id: "user-session", role: "USER", businessId: "business-session" }),
    );
    expect(issueMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no session", null],
    ["missing user id", { user: sessionUser({ id: undefined }) }],
    ["missing business id", { user: sessionUser({ businessId: undefined }) }],
    ["missing role", { user: sessionUser({ role: undefined }) }],
    ["unsupported role", { user: sessionUser({ role: "CASHIER" }) }],
  ])("rejects USER invoice issuance with %s before preparation", async (_case, session) => {
    authMock.mockResolvedValue(session);

    const result = await createAfipVoucherAction(invoice());

    expect(result).toMatchObject({ error: "No autorizado", issuanceNotStarted: true });
    expect(prepareMock).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it("derives actor and tenant exclusively from the authenticated session", async () => {
    const callerInput = {
      ...invoice(),
      authenticatedActor: { id: "forged-user", role: "ADMIN", businessId: "victim-business" },
      businessId: "victim-business",
      role: "ADMIN",
    };

    const result = await createAfipVoucherAction(callerInput);

    expect(result).toMatchObject({ success: true });
    expect(prepareMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ authenticatedActor: expect.anything(), businessId: "victim-business", role: "ADMIN" }),
      expect.objectContaining({ id: "user-session", role: "USER", businessId: "business-session" }),
    );
    expect(issueMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["associated voucher number", { nroAsociado: 45 }],
    ["associated point of sale", { ptoVentaAsociado: 3 }],
    ["associated CAE", { caeAsociado: "71234567890123" }],
    ["associated vouchers", { CbtesAsoc: [{ Tipo: 6, PtoVta: 3, Nro: 45 }] }],
    ["trusted fiscal snapshot", { fiscalSnapshot: validSnapshot("Factura B", 6) }],
    ["trusted fiscal breakdown", { fiscalBreakdown: { source: "AUTHORIZED_VOUCHER" } }],
  ])("rejects USER input containing %s before sequence lookup or issuance", async (_case, restrictedFields) => {
    const result = await createAfipVoucherAction({ ...invoice(), ...restrictedFields });

    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("issuanceNotStarted", true);
    expect(prepareMock).not.toHaveBeenCalled();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "SUPER_ADMIN"])("preserves invoice access for %s", async (role) => {
    authMock.mockResolvedValue({ user: sessionUser({ role }) });

    const result = await createAfipVoucherAction(invoice());

    expect(result).toMatchObject({ success: true });
    expect(prepareMock).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ role }));
    expect(issueMock).toHaveBeenCalledTimes(1);
  });
});
