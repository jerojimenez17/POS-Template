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
       CAE: JSON.stringify({ CAE: "12345678901234", nroComprobante: 1234, ptoVenta: 7 }),
       billType: "Factura B", afipVoucherType: 6, invoiceNumber: 1234, invoicePointOfSale: 7,
       clientId: "client-1", clientDocumentType: "DNI", clientDocumentNumber: "30123456", clientIvaCondition: "Consumidor Final",
       items: [], client: { name: "Cliente histórico" }, saleReturns: [{ status: "AUTHORIZED", creditNoteBillType: "Nota de Crédito B", creditNoteAfipType: 8, creditNoteCAE: "79999999999999", creditNoteNumber: 88, creditNotePointOfSale: 7, originalCAE: "12345678901234", originalVoucherType: 6, originalNumber: 1234, originalPointOfSale: 7 }],
    });

    expect(mapped).toMatchObject({
      billType: "Factura B",
      CAE: expect.objectContaining({ CAE: "12345678901234" }),
      client: "Cliente histórico",
      clientId: "client-1",
      clientDocumentType: "DNI",
      clientDocumentNumber: "30123456",
      clientIvaCondition: "Consumidor Final",
      originalVoucher: { billType: "Factura B", afipVoucherType: 6, number: 1234, pointOfSale: 7 },
    });
    expect(mapped).toMatchObject({ creditNote: expect.objectContaining({ billType: "Nota de Crédito B", cae: "79999999999999", number: 88 }) });
    expect(mapped).toMatchObject({ creditNote: expect.objectContaining({ originalBillType: "Factura B", originalAfipVoucherType: 6, originalCae: "12345678901234", originalNumber: 1234, originalPointOfSale: 7 }) });
    expect(mapped).not.toMatchObject({ CAE: expect.objectContaining({ CAE: "79999999999999" }) });
  });

  it("does not lose invoice history when a return row has no usable CAE", async () => {
    const history = await loadHistory();
    const mapped = history.mapOrderToBillState({
      id: "order-2", total: 100, discountAmount: 0, discountPercentage: 0, date: new Date(), seller: "seller",
      CAE: "12345678901234", billType: "Factura A", afipVoucherType: 1, invoiceNumber: 42, invoicePointOfSale: 3,
      clientDocumentType: "CUIT", clientDocumentNumber: "20123456789", clientIvaCondition: "Responsable Inscripto",
      items: [], client: { name: "Cliente A" }, saleReturns: [{ status: "AUTHORIZED", creditNoteBillType: "Nota de Crédito A", creditNoteAfipType: 3, creditNoteCAE: "malformed-cae", creditNoteNumber: 9, creditNotePointOfSale: 3, originalVoucherType: 1, originalNumber: 42, originalPointOfSale: 3 }],
    });

    expect(mapped).toMatchObject({
      CAE: expect.objectContaining({ CAE: "12345678901234" }),
      originalVoucher: { billType: "Factura A", afipVoucherType: 1, number: 42, pointOfSale: 3 },
      client: "Cliente A", clientDocumentType: "CUIT", clientDocumentNumber: "20123456789",
    });
    expect(mapped).not.toMatchObject({ creditNote: expect.objectContaining({ cae: "malformed-cae" }) });
  });
});
