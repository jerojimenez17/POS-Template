import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireFeatureMock, credentialsMock, voucherNumberMock, axiosPostMock } = vi.hoisted(() => ({
  requireFeatureMock: vi.fn(),
  credentialsMock: vi.fn(),
  voucherNumberMock: vi.fn(),
  axiosPostMock: vi.fn(),
}));

vi.mock("@/lib/auth-gates", () => ({ requireFeature: requireFeatureMock }));
vi.mock("@/lib/server/arca-billing", () => ({
  getArcaCredentialsForBilling: credentialsMock,
  getVoucherNumberForActor: voucherNumberMock,
}));
vi.mock("axios", () => ({
  default: {
    post: axiosPostMock,
    isAxiosError: () => false,
  },
}));

import {
  issuePreparedAfipVoucher,
  prepareAfipVoucherForActor,
} from "@/lib/server/afip-voucher";
import type BillState from "@/models/BillState";

const actor = {
  id: "user-1",
  businessId: "business-1",
  role: "ADMIN",
  email: "qa@example.test",
  business: null,
};

const billState = (overrides: Record<string, unknown> = {}): BillState => ({
  id: "bill-1",
  billType: "Factura B",
  products: [],
  total: 100,
  totalWithDiscount: 100,
  seller: "QA",
  discount: 0,
  date: new Date("2026-10-01T00:00:00.000Z"),
  typeDocument: "FACTURA",
  documentNumber: 1,
  IVACondition: "Consumidor Final",
  twoMethods: false,
  ptoVenta: 9,
  ...overrides,
} as unknown as BillState);

const voucherNumberActor = { businessId: "business-1", role: "ADMIN" };

async function prepareAndIssue(state: BillState) {
  const preparation = await prepareAfipVoucherForActor(state, actor);
  if (!("prepared" in preparation)) {
    return { preparation, issuance: undefined };
  }

  return {
    preparation,
    issuance: await issuePreparedAfipVoucher(preparation.prepared),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-access-token");
  vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-key");
  vi.stubEnv("NEXT_PUBLIC_AFIP_FUNCTION_URL", "https://example.test/create-voucher");

  requireFeatureMock.mockResolvedValue({ success: true, data: actor });
  credentialsMock.mockResolvedValue({
    success: {
      cuit: "20123456789",
      cert: "encrypted-cert",
      key: "encrypted-key",
      ptoVentas: [9],
    },
  });
  voucherNumberMock.mockResolvedValue({ success: 41 });
  axiosPostMock.mockResolvedValue({
    status: 200,
    data: { success: true, data: { CAE: "12345678901234", nroCbte: 42, ptoVenta: 9 } },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AFIP invoice versus credit-note classification by nroAsociado", () => {
  const invoiceCases = [
    ...["Factura A", "Factura B", "Factura C"].flatMap((selectedBillType, index) => {
      const invoiceType = [1, 6, 11][index];
      return [
        { selectedBillType, label: "omitted nroAsociado", includeNro: false, nro: undefined, invoiceType },
        { selectedBillType, label: "undefined nroAsociado", includeNro: true, nro: undefined, invoiceType },
        { selectedBillType, label: "nroAsociado zero", includeNro: true, nro: 0, invoiceType },
        { selectedBillType, label: "nroAsociado negative zero", includeNro: true, nro: -0, invoiceType },
      ];
    }),
  ];

  it.each(invoiceCases)(
    "$selectedBillType with $label uses invoice type $invoiceType and invoice operation",
    async ({ selectedBillType, includeNro, nro, invoiceType }) => {
      const state = billState({
        billType: selectedBillType,
        ...(includeNro ? { nroAsociado: nro } : {}),
      });

      const { preparation, issuance } = await prepareAndIssue(state);

      expect(preparation).toHaveProperty("success", true);
      expect(issuance).toMatchObject({ success: true });
      expect(voucherNumberMock).toHaveBeenCalledExactlyOnceWith(
        9,
        invoiceType,
        "invoice",
        voucherNumberActor,
      );
      expect(axiosPostMock).toHaveBeenCalledTimes(1);
      const payload = axiosPostMock.mock.calls[0]?.[1] as {
        arca: { tipoFactura: number };
      };
      expect(payload.arca.tipoFactura).toBe(invoiceType);
    },
  );

  it("treats the default Factura B nroAsociado: 0 as an invoice, not a rejected credit note", async () => {
    const { preparation, issuance } = await prepareAndIssue(billState({ nroAsociado: 0 }));

    expect(preparation).toHaveProperty("success", true);
    expect(issuance).toMatchObject({ success: true });
    expect(voucherNumberMock).toHaveBeenCalledExactlyOnceWith(9, 6, "invoice", voucherNumberActor);
    expect(voucherNumberMock).not.toHaveBeenCalledWith(9, 8, "credit-note", voucherNumberActor);
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(axiosPostMock.mock.calls[0]?.[1]).toMatchObject({ arca: { tipoFactura: 6 } });
  });

  it.each([
    {
      label: "Factura A",
      billType: "Factura A",
      originalAfipVoucherType: 1,
      creditNoteType: 3,
      fiscalBreakdown: {
        source: "AUTHORIZED_VOUCHER",
        version: 1,
        originalAfipVoucherType: 1,
        ImpTotal: 100,
        ImpNeto: 82.64,
        ImpIVA: 17.36,
        ImpTotConc: 0,
        ImpOpEx: 0,
        ImpTrib: 0,
        Iva: [{ Id: 5, BaseImp: 82.64, Importe: 17.36 }],
      },
    },
    {
      label: "Factura B",
      billType: "Factura B",
      originalAfipVoucherType: 6,
      creditNoteType: 8,
      fiscalBreakdown: {
        source: "AUTHORIZED_VOUCHER",
        version: 1,
        originalAfipVoucherType: 6,
        ImpTotal: 100,
        ImpNeto: 82.64,
        ImpIVA: 17.36,
        ImpTotConc: 0,
        ImpOpEx: 0,
        ImpTrib: 0,
        Iva: [{ Id: 5, BaseImp: 82.64, Importe: 17.36 }],
      },
    },
    {
      label: "Factura C",
      billType: "Factura C",
      originalAfipVoucherType: 11,
      creditNoteType: 13,
      fiscalBreakdown: {
        source: "AUTHORIZED_VOUCHER",
        version: 1,
        originalAfipVoucherType: 11,
        ImpTotal: 100,
        ImpNeto: 0,
        ImpIVA: 0,
        ImpTotConc: 100,
        ImpOpEx: 0,
        ImpTrib: 0,
        Iva: [],
      },
    },
  ])("uses credit-note type $creditNoteType for associated $label", async ({
    billType: selectedBillType,
    creditNoteType,
    fiscalBreakdown,
  }) => {
    const { preparation, issuance } = await prepareAndIssue(billState({
      billType: selectedBillType,
      nroAsociado: 21,
      ptoVentaAsociado: 4,
      caeAsociado: "98765432101234",
      fiscalBreakdown,
    }));

    expect(preparation).toHaveProperty("success", true);
    expect(issuance).toMatchObject({ success: true });
    expect(voucherNumberMock).toHaveBeenCalledExactlyOnceWith(
      9,
      creditNoteType,
      "credit-note",
      voucherNumberActor,
    );
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(axiosPostMock.mock.calls[0]?.[1]).toMatchObject({
      arca: { tipoFactura: creditNoteType },
      billState: { fiscalBreakdown },
    });
  });

  it.each([
    { label: "a numeric string", value: "21" },
    { label: "a nonnumeric string", value: "not-a-number" },
    { label: "null", value: null },
    { label: "a boolean", value: false },
    { label: "an object", value: {} },
  ])("does not classify nroAsociado $label as a credit-note signal by itself", async ({ value }) => {
    const { preparation, issuance } = await prepareAndIssue(billState({ nroAsociado: value }));

    expect(preparation).toHaveProperty("success", true);
    expect(issuance).toMatchObject({ success: true });
    expect(voucherNumberMock).toHaveBeenCalledExactlyOnceWith(9, 6, "invoice", voucherNumberActor);
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(axiosPostMock.mock.calls[0]?.[1]).toMatchObject({ arca: { tipoFactura: 6 } });
  });

  it.each([
    { label: "negative", value: -21 },
    { label: "fractional", value: 21.5 },
    { label: "unsafe integer", value: Number.MAX_SAFE_INTEGER + 1 },
    { label: "NaN", value: Number.NaN },
    { label: "positive infinity", value: Number.POSITIVE_INFINITY },
    { label: "negative infinity", value: Number.NEGATIVE_INFINITY },
  ])("rejects nonzero numeric nroAsociado when it is $label before voucher lookup or issuance", async ({ value }) => {
    const result = await prepareAfipVoucherForActor(billState({ nroAsociado: value }), actor);

    expect(result).toMatchObject({
      error: "Los datos del comprobante original de la Nota de Crédito no son válidos",
      issuanceNotStarted: true,
    });
    expect(voucherNumberMock).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  const partialAssociationCases = [
    { label: "ptoVentaAsociado", indicator: { ptoVentaAsociado: 4 } },
    { label: "caeAsociado", indicator: { caeAsociado: "98765432101234" } },
    { label: "non-empty CbtesAsoc", indicator: { CbtesAsoc: [{ Tipo: 6, PtoVta: 4, Nro: 21 }] } },
  ];

  it.each(partialAssociationCases)(
    "keeps a partial $label association on the credit-note validation path when nroAsociado is zero",
    async ({ indicator }) => {
      const result = await prepareAfipVoucherForActor(billState({ nroAsociado: 0, ...indicator }), actor);

      expect(result).toMatchObject({
        error: "Los datos del comprobante original de la Nota de Crédito no son válidos",
        issuanceNotStarted: true,
      });
      expect(voucherNumberMock).not.toHaveBeenCalled();
      expect(axiosPostMock).not.toHaveBeenCalled();
    },
  );

  it.each(partialAssociationCases)(
    "keeps a partial $label association on the credit-note validation path when nroAsociado is absent",
    async ({ indicator }) => {
      const result = await prepareAfipVoucherForActor(billState(indicator), actor);

      expect(result).toMatchObject({
        error: "Los datos del comprobante original de la Nota de Crédito no son válidos",
        issuanceNotStarted: true,
      });
      expect(voucherNumberMock).not.toHaveBeenCalled();
      expect(axiosPostMock).not.toHaveBeenCalled();
    },
  );

  it("does not treat an empty CbtesAsoc array as an association", async () => {
    const { preparation, issuance } = await prepareAndIssue(billState({ nroAsociado: 0, CbtesAsoc: [] }));

    expect(preparation).toHaveProperty("success", true);
    expect(issuance).toMatchObject({ success: true });
    expect(voucherNumberMock).toHaveBeenCalledExactlyOnceWith(9, 6, "invoice", voucherNumberActor);
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
  });
});
