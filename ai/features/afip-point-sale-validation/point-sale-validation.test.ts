import { describe, expect, it } from "vitest";
import {
  getAfipVoucherTypeCode,
  formatAfipPointSaleErrorForUser,
  validatePointSaleRequest,
} from "@/services/afip/point-sale-validation";

describe("AFIP point-sale request contract", () => {
  it.each([
    ["Factura A", 1],
    ["Factura B", 6],
    ["Factura C", 11],
  ] as const)("maps %s to WSFE code %s", (billType, expected) => {
    expect(getAfipVoucherTypeCode(billType)).toBe(expected);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid point of sale %s",
    (ptoVenta) => {
      expect(() => validatePointSaleRequest({ ptoVenta, tipoFactura: 6 }, [1, 2])).toThrow(
        /punto de venta/i,
      );
    },
  );

  it("rejects a positive point that is not configured", () => {
    expect(() => validatePointSaleRequest({ ptoVenta: 99, tipoFactura: 11 }, [1, 2])).toThrow(
      /configurado/i,
    );
  });

  it.each([1, 6, 11] as const)("accepts invoice code %s", (tipoFactura) => {
    expect(validatePointSaleRequest({ ptoVenta: 2, tipoFactura }, [1, 2])).toEqual({
      ptoVenta: 2,
      tipoFactura,
    });
  });

  it("formats an actionable 11002 message with point, type and ARCA steps", () => {
    const message = formatAfipPointSaleErrorForUser({
      code: "11002",
      message: "El punto no está habilitado",
      operation: "createVoucher",
      ptoVenta: 7,
      tipoFactura: 6,
      environment: "homologacion",
    });

    expect(message).toContain("11002");
    expect(message).toMatch(/007|7/);
    expect(message).toMatch(/Factura B|tipo 6/i);
    expect(message).toMatch(/WSFE\/?WSFEv1|WSFEv1/i);
    expect(message).toMatch(/CUIT|ambiente|ARCA/i);
    expect(message).toMatch(/No se generó CAE/i);
    expect(message).not.toMatch(/cambiar.*tipo.*soluciona/i);
  });
});
