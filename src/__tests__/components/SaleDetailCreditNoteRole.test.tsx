import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SaleDetailPage from "@/app/(protected)/sales/[id]/page";

const { authMock, getSaleMock } = vi.hoisted(() => ({ authMock: vi.fn(), getSaleMock: vi.fn() }));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/actions/sales", () => ({ getSaleByIdAction: getSaleMock }));
vi.mock("@/actions/sales/credit-note", () => ({ createCreditNoteAction: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("lucide-react", () => ({
  Package: () => null,
  User: () => null,
  CreditCard: () => null,
  Calendar: () => null,
  ArrowLeft: () => null,
  Edit2: () => null,
}));
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/separator", () => ({ Separator: () => <hr /> }));
vi.mock("@/components/Billing/SaleHistory", () => ({ default: () => null }));
vi.mock("@/components/Billing/CreditNoteButton", () => ({
  default: () => <button type="button">Actionable credit-note operation</button>,
}));
vi.mock("@/components/Billing/CreditNoteEligibilityNotice", () => ({
  default: () => <p>Fiscal eligibility information</p>,
}));
vi.mock("@/components/Billing/CreditNoteStatusCard", () => ({ default: () => <p>Credit-note status</p> }));
vi.mock("@/lib/print/receipt-data", () => ({ buildCreditNotePrintContext: vi.fn() }));

const detailSale = {
  id: "sale-1",
  date: new Date("2026-04-20T12:00:00.000Z"),
  seller: "seller@example.com",
  twoMethods: false,
  paidMethod: "Efectivo",
  client: "Customer",
  products: [],
  total: 100,
  totalWithDiscount: 100,
  discount: 0,
  fiscalContext: {
    orderId: "sale-1",
    billType: "Factura B",
    originalAfipVoucherType: 6,
    originalCAE: "12345678901234",
    invoiceNumber: 5,
    invoicePointOfSale: 3,
    total: 100,
    products: [],
    creditNote: null,
    eligibleForFullCreditNote: true,
  },
  fiscalDiagnostic: { status: "INELIGIBLE", reason: "SALE_CONTENT_INCOMPLETE", message: "Read-only diagnostic" },
};

describe("sale detail credit-note visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSaleMock.mockResolvedValue(detailSale);
  });

  it.each([
    ["ADMIN", true],
    ["USER", false],
    ["SUPER_ADMIN", false],
  ])("shows the actionable control for %s only", async (role, shouldShowAction) => {
    authMock.mockResolvedValue({ user: { id: "actor-1", businessId: "business-1", role } });
    render(await SaleDetailPage({ params: Promise.resolve({ id: "sale-1" }) }));

    if (shouldShowAction) {
      expect(screen.getByRole("button", { name: "Actionable credit-note operation" })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: "Actionable credit-note operation" })).not.toBeInTheDocument();
    }
    expect(screen.getByText("Fiscal eligibility information")).toBeInTheDocument();
  });
});
