import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAfipPointSaleError } from "@/services/afip/point-sale-validation";

describe("AFIP 11002 parser", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    { error: "AFIP error 11002: punto no habilitado" },
    { success: false, data: { error: { code: "11002", message: "WSFE rechazó el punto" } } },
    { details: { error: "Código 11002 para el punto" } },
    { response: { data: { details: { message: "AxiosError: Request failed (11002)" } } } },
  ])("detects 11002 in $error", (payload) => {
    const result = parseAfipPointSaleError(payload, {
      operation: "getLastVoucher",
      ptoVenta: 7,
      tipoFactura: 6,
    });

    expect(result).toMatchObject({
      code: "11002",
      operation: "getLastVoucher",
      ptoVenta: 7,
      tipoFactura: 6,
    });
    expect(result.message).toMatch(/11002|punto/i);
  });

  it("preserves createVoucher context and sanitizes secrets", () => {
    const result = parseAfipPointSaleError(
      { error: "11002 cert=PRIVATE_CERT key=PRIVATE_KEY token=SECRET" },
      { operation: "createVoucher", ptoVenta: 12, tipoFactura: 11, environment: "produccion" },
    );

    expect(result).toMatchObject({ code: "11002", operation: "createVoucher", ptoVenta: 12, tipoFactura: 11, environment: "produccion" });
    expect(result.message).not.toMatch(/PRIVATE_CERT|PRIVATE_KEY|SECRET/);
  });

  it("keeps non-11002 failures distinguishable", () => {
    expect(parseAfipPointSaleError({ error: "HTTP 503" }, { operation: "getLastVoucher", ptoVenta: 1, tipoFactura: 1 })).toMatchObject({ code: "HTTP_503" });
    expect(parseAfipPointSaleError({ error: "credenciales inválidas" }, { operation: "getLastVoucher", ptoVenta: 1, tipoFactura: 1 })).not.toMatchObject({ code: "11002" });
  });
});
