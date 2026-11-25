import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  orderFindUnique: vi.fn(),
  businessFindUnique: vi.fn(),
  addPaymentForm: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    order: { findUnique: mocks.orderFindUnique },
    business: { findUnique: mocks.businessFindUnique },
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("lucide-react", () => ({
  ArrowLeft: () => null,
  BookOpen: () => null,
  User: () => null,
  Calendar: () => null,
  Package: () => null,
  CheckCircle: () => null,
  Phone: () => null,
  Mail: () => null,
  MapPin: () => null,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <button>{children}</button>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
}));
vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));
vi.mock("@/components/ui/LocalDate", () => ({
  LocalDate: () => <span>02/01/2026</span>,
}));
vi.mock("@/app/(protected)/account-ledger/[id]/AddPaymentForm", () => ({
  default: (props: {
    orderId: string;
    remainingBalance: number;
    businessId: string;
    configuredPtoVentas: number[];
    showForm: boolean;
  }) => {
    mocks.addPaymentForm(props);
    return props.showForm
      ? <form aria-label="Add payment form"><label>Monto</label></form>
      : <button>Registrar Pago</button>;
  },
}));
vi.mock("@/app/(protected)/account-ledger/[id]/CancelOrderButton", () => ({
  default: () => null,
}));
vi.mock("@/app/(protected)/account-ledger/[id]/EditableOrderDetailWrapper", () => ({
  default: () => null,
}));
vi.mock("@/app/(protected)/account-ledger/[id]/PrintOrderButton", () => ({
  default: () => null,
}));
vi.mock("@/components/account-ledger/PaymentVoucherRowActionClient", () => ({
  PaymentVoucherRowActionClient: () => null,
}));

import AccountLedgerDetailPage from "@/app/(protected)/account-ledger/[id]/page";

const baseOrder = {
  id: "order-legacy-123456",
  date: new Date("2026-01-02T12:00:00.000Z"),
  total: 1,
  discountPercentage: 0,
  discountAmount: 0,
  seller: null,
  paymentMethod: null,
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

async function renderDetail(orderOverrides: Record<string, unknown> = {}) {
  mocks.auth.mockResolvedValue({ user: { businessId: "tenant-legacy" } });
  mocks.orderFindUnique.mockResolvedValue({ ...baseOrder, ...orderOverrides });
  mocks.businessFindUnique.mockResolvedValue({ ptoVenta: [3] });

  const page = await AccountLedgerDetailPage({
    params: Promise.resolve({ id: "order-legacy-123456" }),
    searchParams: Promise.resolve({ action: "payment" }),
  });

  return render(page);
}

function expectSafeActionableAmountError() {
  const alert = screen.queryByRole("alert");
  expect.soft(alert).toBeInTheDocument();
  if (alert) {
    expect.soft(alert.textContent).toMatch(/verific|revis|contact|soporte|correg|error/i);
    expect.soft(alert.textContent).not.toMatch(/10\.005|NaN|Infinity|Prisma|SQL/i);
  }
  expect.soft(screen.queryByRole("form", { name: "Add payment form" })).not.toBeInTheDocument();
  expect.soft(screen.queryByRole("button", { name: /registrar pago/i })).not.toBeInTheDocument();
  expect.soft(mocks.addPaymentForm).not.toHaveBeenCalled();
}

describe("account-ledger detail with legacy stored amounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes a legacy order total to the nearest whole peso for the detail and form", async () => {
    await renderDetail({ total: 10.49 });

    const totalText = screen.getByText("Total Orden").parentElement?.textContent;
    const remainingText = screen.getByText("Saldo Pendiente").parentElement?.textContent;
    expect(totalText?.endsWith("$10")).toBe(true);
    expect(remainingText?.endsWith("$10")).toBe(true);
    expect(mocks.addPaymentForm).toHaveBeenCalledWith(expect.objectContaining({ remainingBalance: 10 }));
    expect(screen.getByRole("form", { name: "Add payment form" })).toBeInTheDocument();
  });

  it("rounds a legacy order total of 10.005 to 10 whole pesos", async () => {
    await renderDetail({ total: 10.005 });

    expect(screen.getByText("Total Orden").parentElement?.textContent?.endsWith("$10")).toBe(true);
    expect(screen.getByText("Saldo Pendiente").parentElement?.textContent?.endsWith("$10")).toBe(true);
    expect(mocks.addPaymentForm).toHaveBeenCalledWith(expect.objectContaining({ remainingBalance: 10 }));
    expect(screen.getByRole("form", { name: "Add payment form" })).toBeInTheDocument();
  });

  it("rounds a legacy 10.005 cash movement before deriving the remaining balance", async () => {
    await renderDetail({
      total: 20,
      cashMovements: [{
        id: "legacy-decimal-payment",
        date: new Date("2026-01-03T12:00:00.000Z"),
        total: 10.005,
        paidMethod: "Efectivo",
        paymentVoucher: null,
      }],
    });

    expect(mocks.addPaymentForm).toHaveBeenCalledWith(expect.objectContaining({ remainingBalance: 10 }));
    expect(screen.getByRole("form", { name: "Add payment form" })).toBeInTheDocument();
    expect(screen.queryByText(/10,005|10\.005/)).not.toBeInTheDocument();
  });

  it.each([
    ["order total", "total", Number.NaN],
    ["order total", "total", Number.POSITIVE_INFINITY],
  ])("does not coerce a non-finite %s (%s) to zero", async (_label, field, amount) => {
    await renderDetail({ [field]: amount });

    expectSafeActionableAmountError();
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("does not coerce a non-finite cash movement amount (%s) to zero", async (_label, amount) => {
    await renderDetail({
      total: 20,
      cashMovements: [{
        id: "legacy-non-finite-payment",
        date: new Date("2026-01-03T12:00:00.000Z"),
        total: amount,
        paidMethod: "Efectivo",
        paymentVoucher: null,
      }],
    });

    expectSafeActionableAmountError();
  });
});
