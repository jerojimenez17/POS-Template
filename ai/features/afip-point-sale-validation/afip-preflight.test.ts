import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { createAfipVoucherAction } from "@/actions/afip";
import { getVoucherNumberAction } from "@/actions/voucher";
import { updateOrderCaeAction } from "@/actions/sales/update";
import type BillState from "@/models/BillState";

vi.mock("axios");
vi.mock("@/actions/voucher", () => ({ getVoucherNumberAction: vi.fn() }));
vi.mock("@/actions/sales/update", () => ({ updateOrderCaeAction: vi.fn() }));
vi.mock("@/lib/auth-gates", () => ({ requireFeature: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@/actions/arca", () => ({ getArcaCredentialsForBilling: vi.fn().mockResolvedValue({ success: { cuit: "20*********9", cert: "cert", key: "key" } }) }));

const bill = (billType: "Factura A" | "Factura B" | "Factura C", ptoVenta = 7): BillState => ({
  id: "ticket-1", products: [{ id: "p1", code: "P1", description: "Producto", price: 100, salePrice: 100, amount: 1 }],
  total: 100, totalWithDiscount: 100, seller: "seller", discount: 0, date: new Date(), typeDocument: "Consumidor Final",
  documentNumber: 0, IVACondition: "Consumidor Final", twoMethods: false, billType, ptoVenta,
}) as BillState;

describe("createAfipVoucherAction preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_AFIP_API_KEY = "internal-test-key";
    process.env.AFIP_SDK_ACCESS_TOKEN = "sdk-test-token";
    vi.mocked(axios.post).mockResolvedValue({ data: { afip: { CAE: "CAE-1", CAEFchVto: "20261231" } } });
  });

  it.each([
    ["Factura A", 1], ["Factura B", 6], ["Factura C", 11],
  ] as const)("preflights and creates with the same code for %s", async (billType, tipoFactura) => {
    vi.mocked(getVoucherNumberAction).mockResolvedValue({ success: 10 });
    const result = await createAfipVoucherAction(bill(billType));
    expect(getVoucherNumberAction).toHaveBeenCalledWith(7, tipoFactura);
    expect(axios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ arca: expect.objectContaining({ puntoVenta: 7 }) }), expect.any(Object));
    expect(result).toMatchObject({ success: true });
  });

  it("does not call createVoucher or persist CAE after preflight 11002", async () => {
    vi.mocked(getVoucherNumberAction).mockResolvedValue({ error: "11002" });
    const result = await createAfipVoucherAction(bill("Factura B"));
    expect(result).toMatchObject({ error: expect.objectContaining({ code: "11002" }) });
    expect(axios.post).not.toHaveBeenCalled();
    expect(updateOrderCaeAction).not.toHaveBeenCalled();
  });

  it("does not treat B→A/C→B as a repair for the same rejected point", async () => {
    vi.mocked(getVoucherNumberAction).mockResolvedValue({ error: "11002" });
    for (const billType of ["Factura B", "Factura A", "Factura C", "Factura B"] as const) {
      const result = await createAfipVoucherAction(bill(billType));
      expect(result).toMatchObject({ error: expect.objectContaining({ code: "11002", ptoVenta: 7 }) });
    }
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("rejects a successful HTTP response with an empty CAE", async () => {
    vi.mocked(getVoucherNumberAction).mockResolvedValue({ success: 10 });
    vi.mocked(axios.post).mockResolvedValue({ data: { afip: { CAE: "", CAEFchVto: "" } } });
    const result = await createAfipVoucherAction(bill("Factura C"));
    expect(result).toMatchObject({ error: expect.stringMatching(/CAE/i) });
    expect(updateOrderCaeAction).not.toHaveBeenCalled();
  });
});
