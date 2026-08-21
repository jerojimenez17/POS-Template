import { beforeEach, describe, expect, it, vi } from "vitest";

const { post, preflight, requireFeature, credentials } = vi.hoisted(() => ({
  post: vi.fn(),
  preflight: vi.fn(),
  requireFeature: vi.fn(),
  credentials: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    post: (...args: unknown[]) => post(...args),
    isAxiosError: (value: unknown) =>
      typeof value === "object" && value !== null &&
      (value as { isAxiosError?: boolean }).isAxiosError === true,
  },
  isAxiosError: (value: unknown) =>
    typeof value === "object" && value !== null &&
    (value as { isAxiosError?: boolean }).isAxiosError === true,
}));
vi.mock("@/actions/voucher", () => ({ getVoucherNumberAction: preflight }));
vi.mock("@/lib/auth-gates", () => ({ requireFeature }));
vi.mock("@/actions/arca", () => ({ getArcaCredentialsForBilling: credentials }));

import { createAfipVoucherAction } from "@/actions/afip";
import type BillState from "@/models/BillState";

const VALID_CAE = "12345678901234";
const metadata = {
  CAEFchVto: "20261231",
  nroCbte: 42,
  qrData: "sensitive-qr-value",
};

const bill = (billType: "Factura A" | "Factura B" | "Factura C" = "Factura B") => ({
  id: "sale-1", products: [{ id: "p1", code: "P1", description: "Producto", price: 100, salePrice: 100, amount: 1 }],
  total: 100, totalWithDiscount: 100, seller: "seller", discount: 0,
  date: new Date("2026-08-21T10:00:00Z"), typeDocument: "Consumidor Final",
  documentNumber: 0, IVACondition: "Consumidor Final", twoMethods: false,
  ptoVenta: 7, billType,
} as unknown as BillState);

const runWithResponse = async (data: unknown, billType?: "Factura A" | "Factura B" | "Factura C") => {
  post.mockResolvedValue({ status: 200, data });
  return createAfipVoucherAction(bill(billType));
};

describe("AFIP no-CAE response — G2 RED contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_AFIP_API_KEY = "test-internal-key";
    process.env.AFIP_SDK_ACCESS_TOKEN = "test-access-token";
    requireFeature.mockResolvedValue({ success: true });
    credentials.mockResolvedValue({ success: { cuit: "20123456789", cert: "cert-secret", key: "key-secret" } });
    preflight.mockResolvedValue({ success: 10 });
  });

  describe("parser: six supported success paths", () => {
    it.each([
      ["direct", { CAE: VALID_CAE }, "direct"],
      ["afip", { afip: { CAE: VALID_CAE, ...metadata } }, "afip"],
      ["data", { data: { CAE: VALID_CAE, ...metadata } }, "data"],
      ["data.afip", { data: { afip: { CAE: VALID_CAE, ...metadata } } }, "data.afip"],
      ["success direct", { success: true, data: { CAE: VALID_CAE, ...metadata } }, "data"],
      ["success data.afip", { success: true, data: { afip: { CAE: VALID_CAE, ...metadata } } }, "data.afip"],
    ] as const)("accepts CAE at %s", async (_name, response, sourcePath) => {
      const result = await runWithResponse(response);
      expect(result).toMatchObject({
        success: true,
        data: { cae: VALID_CAE, sourcePath },
      });
      expect(result).not.toHaveProperty("data.afip");
    });
  });

  it.each(["", "   ", null, undefined, {}, true, "1234567890123", "123456789012345", "ABC12345678901"] as const)(
    "rejects invalid CAE candidate %p as missing-cae and never authorizes persistence",
    async (CAE) => {
      const result = await runWithResponse({ success: true, data: { CAE } });
      expect(result).toMatchObject({ error: expect.stringMatching(/sin un CAE válido|missing-cae/i) });
      expect(result).not.toMatchObject({ success: true });
    },
  );

  it.each([
    ["success false", { success: false, error: { code: "11002", message: "Punto de venta no habilitado" } }],
    ["nested AFIP error", { data: { afip: { errors: [{ code: "11002", message: "rechazo AFIP" }] } } }],
    ["textual 11002", { message: "AFIP rechazó la operación (11002)" }],
  ] as const)("prioritizes %s over missing-cae", async (_name, response) => {
    const result = await runWithResponse(response);
    expect(result).toMatchObject({ error: expect.objectContaining({ code: "11002" }) });
    expect(result).not.toMatchObject({ error: expect.stringMatching(/sin un CAE|missing-cae/i) });
  });

  it("preserves an AFIP 11002 from an HTTP non-2xx response with operation context", async () => {
    post.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { error: "11002" } } });
    const result = await createAfipVoucherAction(bill());
    expect(result).toMatchObject({ error: { code: "11002", operation: "createVoucher", ptoVenta: 7, tipoFactura: 6 } });
  });

  it("returns a safe shape diagnostic for 2xx without CAE", async () => {
    const result = await runWithResponse({ success: true, data: { message: "no autorizado", token: "secret-token", qrData: "secret-qr" } });
    expect(result).toMatchObject({ error: expect.stringMatching(/sin un CAE válido/i), diagnostic: { routes: expect.any(Array) } });
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain("secret-qr");
    expect(JSON.stringify(result)).not.toContain(VALID_CAE);
  });

  it.each([
    ["Factura A", 1], ["Factura B", 6], ["Factura C", 11],
  ] as const)("keeps %s as AFIP type %s in preflight and createVoucher payload", async (billType, tipoFactura) => {
    await runWithResponse({ data: { afip: { CAE: VALID_CAE, ...metadata } } }, billType);
    expect(preflight).toHaveBeenCalledWith(7, tipoFactura);
    expect(post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      action: "createVoucher",
      arca: expect.objectContaining({ puntoVenta: 7, tipoFactura }),
    }), expect.any(Object));
  });

  it("does not POST createVoucher when preflight returns error 11002", async () => {
    preflight.mockResolvedValue({ error: "11002" });
    const result = await runWithResponse({ CAE: VALID_CAE });
    expect(post).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.objectContaining({ code: "11002", ptoVenta: 7, tipoFactura: 6 }) });
  });

  it("does not POST createVoucher when preflight has no success", async () => {
    preflight.mockResolvedValue({});
    const result = await runWithResponse({ CAE: VALID_CAE });
    expect(post).not.toHaveBeenCalled();
    expect(result).toHaveProperty("error");
  });

  it("returns the canonical action contract and does not persist", async () => {
    const result = await runWithResponse({ data: { afip: { CAE: VALID_CAE, ...metadata } } });
    expect(result).toEqual({ success: true, data: {
      cae: VALID_CAE, vencimiento: metadata.CAEFchVto, nroComprobante: 42,
      qrData: metadata.qrData, ptoVenta: 7, sourcePath: "data.afip",
    } });
  });
});
