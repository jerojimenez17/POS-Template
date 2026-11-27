import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { createAfipVoucherAction } from "@/actions/afip";
import { updateOrderCaeAction } from "@/actions/sales/update";
import type BillState from "@/models/BillState";

const { voucherNumberMock, credentialsMock, planAFIP } = vi.hoisted(() => ({
  voucherNumberMock: vi.fn(),
  credentialsMock: vi.fn(),
  planAFIP: { value: true },
}));

vi.mock("axios");
vi.mock("@/actions/voucher", () => ({ getVoucherNumberAction: vi.fn() }));
vi.mock("@/actions/sales/update", () => ({ updateOrderCaeAction: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-1", role: "ADMIN" } }) }));
vi.mock("@/lib/auth-gates", () => ({ requireFeature: vi.fn().mockResolvedValue({ success: true, data: { id: "user-1", businessId: "business-1", role: "ADMIN" } }) }));
vi.mock("@/actions/arca", () => ({ getArcaCredentialsForBilling: vi.fn() }));
vi.mock("@/lib/server/arca-billing", () => ({ getVoucherNumberForActor: voucherNumberMock, getArcaCredentialsForBilling: credentialsMock }));
vi.mock("@/lib/plan-resolver", () => ({
  getEffectivePlan: vi.fn().mockImplementation(async () => ({ hasAfipBilling: planAFIP.value })),
  getCachedPlan: vi.fn().mockImplementation(async () => ({ hasAfipBilling: planAFIP.value })),
}));
vi.mock("@/lib/db", () => ({ db: { business: { findUnique: vi.fn().mockResolvedValue({ id: "business-1" }) } } }));

const bill = (billType: "Factura A" | "Factura B" | "Factura C", ptoVenta = 7): BillState => ({
  id: "ticket-1", products: [{ id: "p1", code: "P1", description: "Producto", price: 100, salePrice: 100, amount: 1 }],
  total: 100, totalWithDiscount: 100, seller: "seller", discount: 0, date: new Date(), typeDocument: "Consumidor Final",
  documentNumber: 0, IVACondition: "Consumidor Final", twoMethods: false, billType, ptoVenta,
}) as BillState;

describe("createAfipVoucherAction preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planAFIP.value = true;
    process.env.INTERNAL_AFIP_API_KEY = "internal-test-key";
    process.env.AFIP_SDK_ACCESS_TOKEN = "sdk-test-token";
    credentialsMock.mockResolvedValue({ success: { cuit: "20123456789", cert: "cert", key: "key", ptoVentas: [7] } });
    // Merged voucher-response parser (f485810 stabilization) validates the CAE
    // against /^\d{14}$/ before accepting any candidate path.
    vi.mocked(axios.post).mockResolvedValue({ data: { afip: { CAE: "12345678901234", CAEFchVto: "20261231" } } });
  });

  it.each([
    ["Factura A", 1], ["Factura B", 6], ["Factura C", 11],
  ] as const)("preflights and creates with the same code for %s", async (billType, tipoFactura) => {
    voucherNumberMock.mockResolvedValue({ success: 10 });
    const result = await createAfipVoucherAction(bill(billType));
    expect(voucherNumberMock).toHaveBeenCalledWith(7, tipoFactura, "invoice", expect.objectContaining({ businessId: "business-1", role: "ADMIN" }));
    expect(axios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ arca: expect.objectContaining({ puntoVenta: 7 }) }), expect.any(Object));
    expect(result).toMatchObject({ success: true });
  });

  it("does not call createVoucher or persist CAE after preflight 11002", async () => {
    voucherNumberMock.mockResolvedValue({ error: "11002" });
    const result = await createAfipVoucherAction(bill("Factura B"));
    expect(result).toMatchObject({ error: expect.objectContaining({ code: "11002" }) });
    expect(axios.post).not.toHaveBeenCalled();
    expect(updateOrderCaeAction).not.toHaveBeenCalled();
  });

  it("does not call AFIP when the persisted plan denies AFIP billing", async () => {
    planAFIP.value = false;
    voucherNumberMock.mockResolvedValue({ success: 10 });

    const result = await createAfipVoucherAction(bill("Factura B"));

    expect(result).toMatchObject({ error: expect.stringMatching(/no está habilitada/i) });
    expect(axios.post).not.toHaveBeenCalled();
    expect(updateOrderCaeAction).not.toHaveBeenCalled();
  });

  it("does not treat B→A/C→B as a repair for the same rejected point", async () => {
    voucherNumberMock.mockResolvedValue({ error: "11002" });
    for (const billType of ["Factura B", "Factura A", "Factura C", "Factura B"] as const) {
      const result = await createAfipVoucherAction(bill(billType));
      expect(result).toMatchObject({ error: expect.objectContaining({ code: "11002", ptoVenta: 7 }) });
    }
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("rejects a successful HTTP response with an empty CAE", async () => {
    voucherNumberMock.mockResolvedValue({ success: 10 });
    vi.mocked(axios.post).mockResolvedValue({ data: { afip: { CAE: "", CAEFchVto: "" } } });
    const result = await createAfipVoucherAction(bill("Factura C"));
    expect(result).toMatchObject({ error: expect.stringMatching(/CAE/i) });
    expect(updateOrderCaeAction).not.toHaveBeenCalled();
  });
});
