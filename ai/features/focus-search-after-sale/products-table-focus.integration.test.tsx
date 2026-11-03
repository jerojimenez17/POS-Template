import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAfipVoucherAction } from "@/actions/afip";
import { createBudgetAction } from "@/actions/budget";
import { getClientUnpaidOrders, addItemsToOrder } from "@/actions/unpaid-orders";
import { processSaleAction, updateOrderAction } from "@/actions/sales";
import { getShortcutConfigsAction } from "@/actions/shortcuts";
import { getBusinessBillingInfoAction } from "@/actions/business";
import { getProductByCode, getProductsByCode, getProductsBySearch, getSuppliersForFilter } from "@/actions/stock";
import { BillContext } from "@/context/BillContext";
import { useCashbox } from "@/context/CashboxContext";
import ProductsTable from "@/components/Billing/ProductsTable";

vi.mock("next/font/google", () => ({
  Inter: () => ({ className: "test-font", variable: "--font-inter" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/actions/business", () => ({ getBusinessBillingInfoAction: vi.fn() }));
vi.mock("@/actions/stock", () => ({
  getProductByCode: vi.fn(),
  getProductsByCode: vi.fn(),
  getProductsBySearch: vi.fn(),
  getSuppliersForFilter: vi.fn(),
}));
vi.mock("@yudiel/react-qr-scanner", () => ({ Scanner: () => null }));
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => null }));
vi.mock("qrcode", () => ({ default: { toString: vi.fn().mockResolvedValue("<svg />") } }));
vi.mock("@/lib/print", () => ({
  printThermalReceipt: vi.fn().mockResolvedValue(undefined),
  exportToPDF: vi.fn().mockResolvedValue(undefined),
  buildPDFHTML: vi.fn(() => ""),
  PDF_STYLES: "",
}));
vi.mock("@/actions/afip", () => ({ createAfipVoucherAction: vi.fn() }));
vi.mock("@/actions/sales", () => ({ processSaleAction: vi.fn(), updateOrderAction: vi.fn() }));
vi.mock("@/actions/budget", () => ({ createBudgetAction: vi.fn() }));
vi.mock("@/actions/shortcuts", () => ({
  getShortcutConfigsAction: vi.fn(),
  getProductByShortcutAction: vi.fn(),
}));
vi.mock("@/actions/unpaid-orders", () => ({
  getClientUnpaidOrders: vi.fn(),
  addItemsToOrder: vi.fn(),
}));
vi.mock("@/context/CashboxContext", () => ({
  useCashbox: vi.fn(),
  CashboxProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/Billing/PriceEditInput", () => ({ default: () => null }));
vi.mock("@/components/Billing/DiscountControl", () => ({ default: () => null }));
vi.mock("@/components/Billing/DecimalInput", () => ({ default: () => null }));
vi.mock("@/components/Billing/InlineAmountInput", () => ({ default: () => null }));

interface DeferredFrame {
  callback: FrameRequestCallback;
  frame: number;
}

let frameQueue: DeferredFrame[] = [];
let frameNumber = 0;

const queueFrame = (callback: FrameRequestCallback) => {
  frameQueue.push({ callback, frame: frameNumber + 1 });
  return frameQueue.length;
};

const flushFrame = async () => {
  const currentFrame = ++frameNumber;
  const callbacks = frameQueue.filter((queued) => queued.frame <= currentFrame);
  frameQueue = frameQueue.filter((queued) => queued.frame > currentFrame);

  await act(async () => {
    callbacks.forEach(({ callback }) => callback(currentFrame * 16));
    await Promise.resolve();
  });
};

const flushDeferredFrames = async () => {
  // Nested requestAnimationFrame callbacks are intentionally in different frames.
  for (let count = 0; frameQueue.length > 0 && count < 10; count += 1) {
    await flushFrame();
  }
};

const session = {
  user: {
    id: "focus-integration-user",
    email: "cashier@example.com",
    businessId: "focus-integration-business",
    businessName: "Test Shop",
    business: { features: { hasBudget: true, hasSupplierFilter: false } },
  },
  expires: "2099-01-01",
};

const product = {
  id: "focus-test-product",
  code: "F-1",
  description: "Focusable product",
  unit: "unidad",
  price: 100,
  salePrice: 100,
  amount: 1,
};

const createBillContext = () => ({
  BillState: {
    id: "",
    products: [product],
    total: 100,
    totalWithDiscount: 100,
    discount: 0,
    seller: "cashier@example.com",
    typeDocument: "DNI",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    paidMethod: "Efectivo",
    billType: "Factura C",
    twoMethods: false,
    totalSecondMethod: 0,
    secondPaidMethod: "Debito",
    date: new Date("2025-01-02T12:00:00.000Z"),
  },
  dispatch: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
  onOrderResetRef: { current: null },
  printMode: "thermal" as const,
  setPrintMode: vi.fn(),
  initialBillType: "Factura C",
  billTypeRef: { current: "Factura C" },
  defaultPtoVenta: 1,
  setFocusPriceProductId: vi.fn(),
});

const renderProductsTable = (options?: { isEditing?: boolean }) => {
  const billContext = createBillContext();
  const handlePrint = vi.fn();
  const view = render(
    <BillContext.Provider value={billContext as never}>
      <ProductsTable
        session={session as never}
        isEditing={options?.isEditing}
        orderId={options?.isEditing ? "existing-sale" : undefined}
      />
    </BillContext.Provider>,
  );

  return { ...view, billContext, handlePrint };
};

const makeResponse = (payload: unknown, ok = true) => ({
  ok,
  json: vi.fn().mockResolvedValue(payload),
});

describe("ProductsTable → PrintableTable → ProductSearchBar checkout focus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    frameQueue = [];
    frameNumber = 0;
    vi.stubGlobal("requestAnimationFrame", queueFrame);
    window.requestAnimationFrame = queueFrame;
    vi.mocked(useCashbox).mockReturnValue({
      hasActiveSession: true,
      setIsOpeningModalOpen: vi.fn(),
    } as never);
    vi.mocked(getShortcutConfigsAction).mockResolvedValue({ success: true, data: [] } as never);
    vi.mocked(getBusinessBillingInfoAction).mockResolvedValue(null as never);
    vi.mocked(getProductByCode).mockResolvedValue(null as never);
    vi.mocked(getProductsByCode).mockResolvedValue([] as never);
    vi.mocked(getProductsBySearch).mockResolvedValue([] as never);
    vi.mocked(getSuppliersForFilter).mockResolvedValue([] as never);
    vi.mocked(processSaleAction).mockResolvedValue({ success: true } as never);
    vi.mocked(updateOrderAction).mockResolvedValue({ success: true } as never);
    vi.mocked(createAfipVoucherAction).mockResolvedValue({
      success: true,
      data: { cae: "12345678901234", vencimiento: "20991231", nroComprobante: 1, qrData: "" },
    } as never);
    vi.mocked(createBudgetAction).mockResolvedValue({ success: true } as never);
    vi.mocked(getClientUnpaidOrders).mockResolvedValue({ success: true, data: [] } as never);
    vi.mocked(addItemsToOrder).mockResolvedValue({ success: true } as never);
  });

  it("focuses the real search input only after the successful Remito close and two animation frames", async () => {
    const { billContext } = renderProductsTable();
    const searchInput = screen.getByPlaceholderText(/Buscar producto/);
    const focus = vi.spyOn(searchInput, "focus");
    fireEvent.change(searchInput, { target: { value: "q" } });

    fireEvent.click(screen.getByRole("button", { name: "Remito" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(billContext.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "removeAll" }),
    ));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Confirmar creación de Remito" })).not.toBeInTheDocument());

    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(searchInput);

    await flushFrame();
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(searchInput);

    await flushFrame();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(searchInput);
    expect(searchInput).toHaveValue("q");
  });

  it("does not steal focus when the checkout confirmation is cancelled", async () => {
    const { billContext } = renderProductsTable();
    const searchInput = screen.getByPlaceholderText(/Buscar producto/);
    const focus = vi.spyOn(searchInput, "focus");

    fireEvent.click(screen.getByRole("button", { name: "Remito" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Confirmar creación de Remito" })).not.toBeInTheDocument());
    await flushDeferredFrames();

    expect(focus).not.toHaveBeenCalled();
    expect(processSaleAction).not.toHaveBeenCalled();
    expect(billContext.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "removeAll" }));
  });

  it("preserves cancellation focus when a prior successful sale has deferred search focus queued", async () => {
    const { billContext } = renderProductsTable();
    const searchInput = screen.getByPlaceholderText(/Buscar producto/);
    const focus = vi.spyOn(searchInput, "focus");

    fireEvent.click(screen.getByRole("button", { name: "Remito" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(processSaleAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(billContext.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "removeAll" }),
    ));
    expect(frameQueue).toHaveLength(1);

    const remitoButton = screen.getByRole("button", { name: "Remito" });
    // fireEvent does not reproduce the browser's native click-to-focus behavior.
    remitoButton.focus();
    fireEvent.click(remitoButton);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Confirmar creación de Remito" })).not.toBeInTheDocument());
    const focusRestoredByCancellation = document.activeElement;
    expect(focusRestoredByCancellation).not.toBe(searchInput);
    expect(focus).not.toHaveBeenCalled();

    await flushFrame();
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(focusRestoredByCancellation);

    await flushFrame();
    expect(document.activeElement).not.toBe(screen.getByPlaceholderText(/Buscar producto/));
    expect(document.activeElement).toBe(focusRestoredByCancellation);
    expect(focus).not.toHaveBeenCalled();
  });

  it("does not steal focus after failed sale persistence", async () => {
    vi.mocked(processSaleAction).mockResolvedValue({ error: "save failed" } as never);
    const { billContext } = renderProductsTable();
    const searchInput = screen.getByPlaceholderText(/Buscar producto/);
    const focus = vi.spyOn(searchInput, "focus");

    fireEvent.click(screen.getByRole("button", { name: "Remito" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(processSaleAction).toHaveBeenCalledTimes(1));
    await flushDeferredFrames();

    expect(focus).not.toHaveBeenCalled();
    expect(billContext.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "removeAll" }));
  });

  it("excludes a successful update of an existing sale from new-sale focus", async () => {
    renderProductsTable({ isEditing: true });
    const searchInput = screen.getByPlaceholderText(/Buscar producto/);
    const focus = vi.spyOn(searchInput, "focus");

    fireEvent.click(screen.getByRole("button", { name: "Actualizar Venta" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(updateOrderAction).toHaveBeenCalledWith("existing-sale", expect.any(Object)));
    await flushDeferredFrames();

    expect(focus).not.toHaveBeenCalled();
  });

  it("restores focus after the actual unpaid-order modal reports successful creation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/clients") return makeResponse({ clients: [{ id: "client-1", name: "Customer One" }] });
      if (url.startsWith("/api/unpaid-orders?")) return makeResponse({ orders: [] });
      if (url === "/api/unpaid-orders" && init?.method === "POST") return makeResponse({ success: true });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderProductsTable();
    const searchInput = screen.getByPlaceholderText(/Buscar producto/);
    const focus = vi.spyOn(searchInput, "focus");

    fireEvent.click(screen.getByRole("button", { name: "A cuenta" }));
    fireEvent.click(await screen.findByText("Customer One"));
    await waitFor(() => expect(getClientUnpaidOrders).toHaveBeenCalledWith("client-1"));
    fireEvent.click(await screen.findByTestId("submit-button"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/unpaid-orders", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Crear Orden a Cuenta" })).not.toBeInTheDocument());
    expect(focus).not.toHaveBeenCalled();

    await flushFrame();
    expect(focus).not.toHaveBeenCalled();
    await flushFrame();

    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(searchInput);
  });

  it("does not focus search after the actual unpaid-order creation action fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/clients") return makeResponse({ clients: [{ id: "client-1", name: "Customer One" }] });
      if (url.startsWith("/api/unpaid-orders?")) return makeResponse({ orders: [] });
      if (url === "/api/unpaid-orders" && init?.method === "POST") return makeResponse({ success: false, error: "rejected" });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderProductsTable();
    const searchInput = screen.getByPlaceholderText(/Buscar producto/);
    const focus = vi.spyOn(searchInput, "focus");

    fireEvent.click(screen.getByRole("button", { name: "A cuenta" }));
    fireEvent.click(await screen.findByText("Customer One"));
    await waitFor(() => expect(getClientUnpaidOrders).toHaveBeenCalledWith("client-1"));
    fireEvent.click(await screen.findByTestId("submit-button"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/unpaid-orders", expect.objectContaining({ method: "POST" })));
    await flushDeferredFrames();

    expect(focus).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Crear Orden a Cuenta" })).toBeInTheDocument();
  });

  it("does not steal focus when the actual unpaid-order modal is cancelled", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/clients") {
        return makeResponse({ clients: [{ id: "client-1", name: "Customer One" }] });
      }
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderProductsTable();
    const searchInput = screen.getByPlaceholderText(/Buscar producto/);
    const focus = vi.spyOn(searchInput, "focus");

    fireEvent.click(screen.getByRole("button", { name: "A cuenta" }));
    await screen.findByRole("heading", { name: "Crear Orden a Cuenta" });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Crear Orden a Cuenta" })).not.toBeInTheDocument());
    await flushDeferredFrames();

    expect(focus).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getClientUnpaidOrders).not.toHaveBeenCalled();
  });

  it("safely ignores an already-queued success focus if the billing tree unmounts", async () => {
    const view = renderProductsTable();

    fireEvent.click(screen.getByRole("button", { name: "Remito" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(processSaleAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.billContext.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "removeAll" }),
    ));

    expect(frameQueue.length).toBeGreaterThan(0);
    view.unmount();
    await expect(flushDeferredFrames()).resolves.toBeUndefined();
  });
});
