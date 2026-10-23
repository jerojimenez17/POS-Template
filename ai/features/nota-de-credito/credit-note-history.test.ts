import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, findManyMock } = vi.hoisted(() => ({ authMock: vi.fn(), findManyMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { order: { findMany: findManyMock } } }));

interface HistoryModule {
  mapOrderToBillState: (order: Record<string, unknown>) => Record<string, unknown>;
}

const historyModulePath = "@/actions/sales/history";
const loadHistory = async () =>
  (await import(/* @vite-ignore */ historyModulePath)) as unknown as HistoryModule;

describe("sale history credit-note mapping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps original invoice CAE/type/number and exposes return metadata separately", async () => {
    const history = await loadHistory();
    const mapped = history.mapOrderToBillState({
      id: "order-1", total: 100, discountAmount: 0, discountPercentage: 0, date: new Date(), seller: "seller",
      CAE: JSON.stringify({ CAE: "ORIGINAL-CAE", nroComprobante: 1234, ptoVenta: 7 }),
      billType: "Factura B", afipVoucherType: 6, invoiceNumber: 1234, invoicePointOfSale: 7,
      items: [], client: null, saleReturns: [{ status: "AUTHORIZED", creditNoteBillType: "Nota de Crédito B", creditNoteAfipType: 8, creditNoteCAE: "79999999999999", creditNoteNumber: 88, creditNotePointOfSale: 7, originalCAE: "ORIGINAL-CAE", originalNumber: 1234, originalPointOfSale: 7 }],
    });

    expect(mapped).toMatchObject({ billType: "Factura B", CAE: expect.objectContaining({ CAE: "ORIGINAL-CAE" }) });
    expect(mapped).toMatchObject({ creditNote: expect.objectContaining({ billType: "Nota de Crédito B", cae: "79999999999999", number: 88 }) });
    expect(mapped).not.toMatchObject({ CAE: expect.objectContaining({ CAE: "79999999999999" }) });
  });
});
