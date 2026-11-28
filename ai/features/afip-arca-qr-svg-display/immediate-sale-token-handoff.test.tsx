import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BillButtons from "@/components/Billing/BillButtons";
import { BillContext } from "@/context/BillContext";
import type BillState from "@/models/BillState";

const mocks = vi.hoisted(() => ({
  createAfipVoucherAction: vi.fn(),
  processSaleAction: vi.fn(),
  updateOrderAction: vi.fn(),
  createBillStateSnapshot: vi.fn((state: Record<string, unknown>) => ({ ...state })),
  createBillCheckoutSnapshot: vi.fn(),
  createAfipInvoiceDTO: vi.fn((state: unknown) => state),
  dispatch: vi.fn(),
}));

vi.mock("@/actions/afip", () => ({ createAfipVoucherAction: mocks.createAfipVoucherAction }));
vi.mock("@/actions/sales", () => ({
  processSaleAction: mocks.processSaleAction,
  updateOrderAction: mocks.updateOrderAction,
}));
vi.mock("@/utils/billing", () => ({
  createBillStateSnapshot: mocks.createBillStateSnapshot,
  createBillCheckoutSnapshot: mocks.createBillCheckoutSnapshot,
  createAfipInvoiceDTO: mocks.createAfipInvoiceDTO,
}));
vi.mock("@/context/CashboxContext", () => ({ useCashbox: () => ({
  hasActiveSession: true,
  setIsOpeningModalOpen: vi.fn(),
}) }));
vi.mock("@/hooks/useFeatures", () => ({ useFeatures: () => ({ hasFeature: () => false, isDelinquent: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/actions/shortcuts", () => ({
  getShortcutConfigsAction: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getProductByShortcutAction: vi.fn(),
}));
vi.mock("@/actions/budget", () => ({ createBudgetAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() }, Toaster: () => null }));
vi.mock("../Modal", () => ({ default: () => null }));
vi.mock("../ui/Spinner", () => ({ default: () => null }));
vi.mock("../ledger/ClientSelectionModal", () => ({ default: () => null }));

const TOKEN = "opaque-qr-save-token-from-authorization";

function makeState(): BillState {
  return {
    id: "",
    products: [{ id: "product-immediate-qr", code: "QR-1", description: "Synthetic item", price: 2750, salePrice: 2750, amount: 1 }],
    total: 2750,
    totalWithDiscount: 2750,
    seller: "Synthetic QA seller",
    discount: 0,
    date: new Date("2026-04-09T12:00:00.000Z"),
    typeDocument: "DNI",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    clientIvaCondition: "Consumidor Final",
    clientDocumentType: "",
    clientDocumentNumber: "",
    twoMethods: false,
    paidMethod: "Tarjeta",
    billType: "Factura B",
    ptoVenta: 12,
  } as unknown as BillState;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAfipVoucherAction.mockResolvedValue({
    success: true,
    data: {
      cae: "12345678901234",
      vencimiento: "20261231",
      nroComprobante: 345,
      ptoVenta: 12,
      qrAttestationToken: TOKEN,
    },
  });
  mocks.processSaleAction.mockResolvedValue({ success: true, orderId: "persisted-immediate-order" });
  mocks.updateOrderAction.mockResolvedValue({ success: true });
  mocks.createBillStateSnapshot.mockImplementation((state: Record<string, unknown>) => ({ ...state }));
  mocks.createAfipInvoiceDTO.mockImplementation((state: unknown) => state);
});

describe("immediate invoice save and print ordering", () => {
  it("passes the opaque authorization token to save, then prints only after receiving the persisted order ID", async () => {
    const user = userEvent.setup();
    const handlePrint = vi.fn();
    const state = makeState();
    const context = {
      BillState: state,
      dispatch: mocks.dispatch,
      onOrderResetRef: { current: null },
      printMode: "thermal" as const,
      initialBillType: "Factura B",
      billTypeRef: { current: "Factura B" },
      defaultPtoVenta: 12,
    };

    render(
      <BillContext.Provider value={context as never}>
        <BillButtons
          session={{ user: { id: "user-qr", email: "qa@example.invalid", businessId: "tenant-qr" } } as never}
          handlePrint={handlePrint}
        />
      </BillContext.Provider>,
    );

    await user.click(screen.getByRole("button", { name: "Facturar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(handlePrint).toHaveBeenCalledTimes(1));
    const saveInput = mocks.processSaleAction.mock.calls[0]?.[0] as Record<string, unknown>;
    const savedCae = saveInput.CAE as Record<string, unknown>;
    expect(savedCae.qrAttestationToken).toBe(TOKEN);
    expect(mocks.processSaleAction).toHaveBeenCalledTimes(1);
    expect(mocks.processSaleAction.mock.invocationCallOrder[0])
      .toBeLessThan(handlePrint.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY);

    const [printCae, , printSnapshot] = handlePrint.mock.calls[0] as [Record<string, unknown>, unknown, Record<string, unknown>];
    expect(printSnapshot.id).toBe("persisted-immediate-order");
    expect(printCae).not.toHaveProperty("qrAttestationToken");
    expect(printCae.qrData).toBe("");
    expect(JSON.stringify(printSnapshot)).not.toContain(TOKEN);
  });
});
