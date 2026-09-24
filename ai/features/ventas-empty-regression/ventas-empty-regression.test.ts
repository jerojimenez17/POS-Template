import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, findManyMock, mapperMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findManyMock: vi.fn(),
  mapperMock: vi.fn((order: { id: string }) => ({ id: order.id })),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { order: { findMany: findManyMock } } }));
vi.mock("@/actions/sales/history", () => ({ mapOrderToBillState: mapperMock }));

import { getSalesAction } from "@/actions/sales/get-sales";
import { serializeSalesFilters } from "@/components/Billing/serialize-sales-filters";

const initialState = {
  Remito: { active: true, filter: "remito" },
  FacturaC: { active: false, filter: "facturac" },
  Efectivo: { active: true, filter: "efectivo" },
  Debito: { active: false, filter: "debito" },
  UnPago: { active: false, filter: "Credito 1 pago" },
  Ahora3: { active: false, filter: "ahora 3" },
  Ahora6: { active: false, filter: "ahora 6" },
  Transferencia: { active: false, filter: "transferencia" },
  CuentaDNI: { active: false, filter: "cuentaDNI" },
  Seller: { active: false, filter: "Seleccionar Vendedor" },
  startDate: { active: false, date: new Date("2026-01-01") },
  endDate: { active: false, date: new Date("2026-01-31") },
};

describe("ventas-empty-regression: contrato real de filtros y órdenes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { businessId: "business-a" } });
    findManyMock.mockResolvedValue([]);
  });

  it("returns a paid Remito when the Remito filter is selected", async () => {
    findManyMock.mockResolvedValueOnce([{ id: "remito-1" }]);

    const result = await getSalesAction({
      filters: { documentTypes: ["REMITO"], paymentMethods: [] },
    });

    expect(result.sales).toEqual([{ id: "remito-1" }]);
    expect(findManyMock.mock.calls[0][0].where).toEqual(expect.objectContaining({
      businessId: "business-a",
      paidStatus: "pago",
      billType: { in: ["Remito"] },
    }));
  });

  it.each(["Factura A", "Factura B", "Factura C"])(
    "includes %s when the Facturas selection is active",
    async (billType) => {
      findManyMock.mockResolvedValueOnce([{ id: billType }]);

      const result = await getSalesAction({
        // FACTURA_C is the persisted legacy token emitted by the current UI.
        filters: { documentTypes: ["FACTURA_C"], paymentMethods: [] },
      });

      expect(result.sales).toEqual([{ id: billType }]);
      expect(findManyMock.mock.calls[0][0].where.billType).toEqual({
        in: ["Factura A", "Factura B", "Factura C"],
      });
    },
  );

  it("serializes the initial UI labels to query tokens that return a paid Remito", async () => {
    const filters = serializeSalesFilters(initialState as never);
    findManyMock.mockResolvedValueOnce([{ id: "initial-remito" }]);

    const result = await getSalesAction({ filters });
    const where = findManyMock.mock.calls[0][0].where;

    expect(filters).toMatchObject({ documentTypes: ["REMITO"], paymentMethods: ["efectivo"] });
    expect(result.sales).toEqual([{ id: "initial-remito" }]);
    expect(where.billType).toEqual({ in: ["Remito"] });
    expect(where.AND).toEqual([{
      OR: [
        { paymentMethod: { in: ["Efectivo"] } },
        { paymentMethod2: { in: ["Efectivo"] } },
      ],
    }]);
  });

  it("keeps a split payment visible when the selected method is only paymentMethod2", async () => {
    findManyMock.mockResolvedValueOnce([{ id: "split-payment" }]);

    const result = await getSalesAction({
      filters: { documentTypes: [], paymentMethods: ["efectivo"] },
    });

    expect(result.sales).toEqual([{ id: "split-payment" }]);
    expect(findManyMock.mock.calls[0][0].where.AND).toEqual([{
      OR: [
        { paymentMethod: { in: ["Efectivo"] } },
        { paymentMethod2: { in: ["Efectivo"] } },
      ],
    }]);
  });

  it("does not add type or payment restrictions when both selections are empty", async () => {
    await getSalesAction({ filters: { documentTypes: [], paymentMethods: [] } });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where).toEqual({ businessId: "business-a", paidStatus: "pago" });
  });
});
