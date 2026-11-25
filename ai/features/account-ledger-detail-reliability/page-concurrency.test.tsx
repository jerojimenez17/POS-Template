import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  orderFindUnique: vi.fn(),
  businessFindUnique: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    order: { findUnique: mocks.orderFindUnique },
    business: { findUnique: mocks.businessFindUnique },
  },
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ refresh: vi.fn() }),
}));

import AccountLedgerDetailPage from "@/app/(protected)/account-ledger/[id]/page";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const order = {
  id: "order-123456",
  date: new Date("2026-01-02T12:00:00.000Z"),
  total: 100,
  discountPercentage: 0,
  discountAmount: 0,
  seller: null,
  paidMethod: null,
  clientIvaCondition: null,
  clientDocumentType: null,
  clientDocumentNumber: null,
  status: "pendiente",
  paidStatus: "inpago",
  clientId: null,
  client: null,
  items: [],
  cashMovements: [],
  notes: null,
};

describe("account-ledger detail server page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts independent order and business POS reads after tenant authorization, without waiting for either read", async () => {
    const orderRead = deferred<typeof order | null>();
    const businessRead = deferred<{ ptoVenta: number[] } | null>();
    mocks.auth.mockResolvedValue({ user: { businessId: "tenant-1" } });
    mocks.orderFindUnique.mockReturnValue(orderRead.promise);
    mocks.businessFindUnique.mockReturnValue(businessRead.promise);

    const pagePromise = AccountLedgerDetailPage({
      params: Promise.resolve({ id: "order-1" }),
      searchParams: Promise.resolve({}),
    });

    for (let index = 0; index < 6; index += 1) await Promise.resolve();

    expect(mocks.orderFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-1", businessId: "tenant-1" },
    }));
    expect(mocks.businessFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "tenant-1" },
      select: { ptoVenta: true },
    }));
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.orderFindUnique.mock.invocationCallOrder[0]);
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.businessFindUnique.mock.invocationCallOrder[0]);

    orderRead.resolve(order);
    businessRead.resolve({ ptoVenta: [3] });
    await expect(pagePromise).resolves.toBeTruthy();
  });

  it("keeps absent and out-of-tenant orders on the safe not-found presentation", async () => {
    mocks.auth.mockResolvedValue({ user: { businessId: "tenant-2" } });
    mocks.orderFindUnique.mockResolvedValue(null);
    mocks.businessFindUnique.mockResolvedValue({ ptoVenta: [] });

    const page = await AccountLedgerDetailPage({
      params: Promise.resolve({ id: "foreign-order" }),
      searchParams: Promise.resolve({}),
    });

    expect(mocks.orderFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "foreign-order", businessId: "tenant-2" },
    }));
    render(page);
    expect(screen.getByText("Orden no encontrada")).toBeInTheDocument();
    expect(screen.queryByText(/Cliente|Historial de Pagos|foreign-order/i)).not.toBeInTheDocument();
  });

  it("normalizes order and prior movement before displaying and passing the whole-peso balance", async () => {
    mocks.auth.mockResolvedValue({ user: { businessId: "tenant-1" } });
    mocks.orderFindUnique.mockResolvedValue({
      ...order,
      total: 10.49,
      cashMovements: [{
        id: "cash-half-peso",
        date: new Date("2026-01-03T12:00:00.000Z"),
        total: 0.5,
        paidMethod: "Efectivo",
        paymentVoucher: null,
      }],
    });
    mocks.businessFindUnique.mockResolvedValue({ ptoVenta: [3] });

    const page = await AccountLedgerDetailPage({
      params: Promise.resolve({ id: "order-rounded-pesos" }),
      searchParams: Promise.resolve({ action: "payment" }),
    });
    await act(async () => {
      render(page);
    });

    const amountInput = screen.getByRole("spinbutton") as HTMLInputElement;
    expect.soft(amountInput.value).toBe("9");
    expect.soft(amountInput).toHaveAttribute("max", "9");
    expect.soft(screen.queryByText(/Se registrará \$9(?:\D|$)/)).not.toBeNull();
    expect.soft(screen.getByText("Total Orden").parentElement?.textContent?.endsWith("$10")).toBe(true);
    expect.soft(screen.getByText("Saldo Pendiente").parentElement?.textContent?.endsWith("$9")).toBe(true);
    const paidSummaryLabel = screen.getAllByText("Pagado").find((element) => element.tagName === "SPAN");
    expect.soft(paidSummaryLabel?.parentElement?.textContent?.endsWith("-$1")).toBe(true);
  });

  it("displays zero remaining when whole-peso-rounded payments cover the rounded order total", async () => {
    mocks.auth.mockResolvedValue({ user: { businessId: "tenant-1" } });
    mocks.orderFindUnique.mockResolvedValue({
      ...order,
      total: 10.5,
      paidStatus: "pago",
      cashMovements: [{
        id: "cash-full-peso",
        date: new Date("2026-01-03T12:00:00.000Z"),
        total: 10.5,
        paidMethod: "Efectivo",
        paymentVoucher: null,
      }],
    });
    mocks.businessFindUnique.mockResolvedValue({ ptoVenta: [3] });

    const page = await AccountLedgerDetailPage({
      params: Promise.resolve({ id: "order-fully-paid-pesos" }),
      searchParams: Promise.resolve({}),
    });
    await act(async () => {
      render(page);
    });

    expect.soft(screen.getByText("Saldo Pendiente").parentElement?.textContent?.endsWith("$0")).toBe(true);
    expect.soft(screen.getByText("Total Orden").parentElement?.textContent?.endsWith("$11")).toBe(true);
    const paidSummaryLabel = screen.getAllByText("Pagado").find((element) => element.tagName === "SPAN");
    expect.soft(paidSummaryLabel?.parentElement?.textContent?.endsWith("-$11")).toBe(true);
  });
});
