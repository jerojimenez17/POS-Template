import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, getSalesAction, getBusinessPrintSettingsAction } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getSalesAction: vi.fn(),
  getBusinessPrintSettingsAction: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/actions/business-print-settings", () => ({ getBusinessPrintSettingsAction }));
vi.mock("@/actions/sales/get-sales", () => ({ getSalesAction }));
vi.mock("@/schemas/sales-query", () => ({
  SalesQuerySchema: {
    safeParse: (value: { from?: string; to?: string }) => ({ success: true, data: value }),
  },
}));
vi.mock("@/components/Billing/FilterBillPanel", () => ({ default: () => null }));
vi.mock("@/components/Billing/SearchBillHeader", () => ({ default: () => null }));
vi.mock("@/components/Billing/SalesTable", () => ({ default: () => null }));
vi.mock("@/components/ui/Spinner", () => ({ default: () => null }));

import { SearchBillContent } from "@/app/(protected)/searchBill/page";

describe("search bill report range wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { businessId: "business-1" } });
    getSalesAction.mockResolvedValue({ sales: [], nextCursor: null });
    getBusinessPrintSettingsAction.mockResolvedValue({ qzTray: false });
  });

  it("passes the inclusive URL range to the server before rendering the table", async () => {
    await SearchBillContent({
      searchParams: Promise.resolve({ from: "2026-10-01", to: "2026-10-05", showAll: "true" }),
    });

    expect(getSalesAction).toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-05" });
  });

  it("keeps older paid rows visible on a direct no-param visit", async () => {
    const olderSale = { id: "older-paid-sale" };
    getSalesAction.mockResolvedValue({ sales: [olderSale], nextCursor: "older-cursor" });

    const result = await SearchBillContent({ searchParams: Promise.resolve({}) });
    const content = result.props.children as [React.ReactElement, React.ReactElement];
    const table = (content[1].props.children as React.ReactElement).props.children as React.ReactElement[];

    expect(getSalesAction).toHaveBeenCalledWith({});
    expect(content[0].props.directVisit).toBe(true);
    expect(table[1].props).toEqual(expect.objectContaining({ sales: [olderSale], nextCursor: "older-cursor" }));
  });

  it("does not accept a client-supplied tenant in the initial sales query", async () => {
    await SearchBillContent({
      searchParams: Promise.resolve({ from: "2026-10-01", to: "2026-10-05" }),
    });

    expect(getSalesAction).toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-05" });
    expect(getSalesAction.mock.calls[0][0]).not.toHaveProperty("businessId");
  });

  it("strips USER showAll URL input from seller controls", async () => {
    const result = await SearchBillContent({
      searchParams: Promise.resolve({ showAll: "true" }),
    });
    const children = result.props.children as [React.ReactElement, React.ReactElement];
    const header = children[0];
    const content = children[1];
    const filterPanel = (content.props.children as React.ReactElement).props.children as [React.ReactElement, React.ReactElement];

    expect(header.props).toEqual(expect.objectContaining({ canViewAllSellers: false, initialParams: {} }));
    expect(filterPanel[0].props).toEqual(expect.objectContaining({ canViewAllSellers: false }));
  });

  it("renders an explicit tenant message when the session has no business", async () => {
    const { auth } = await import("@/auth");
    vi.mocked(auth).mockResolvedValue({ user: { businessId: null, role: "SUPER_ADMIN" } } as never);

    const result = await SearchBillContent({ searchParams: Promise.resolve({}) });
    const content = result.props.children as [React.ReactElement, React.ReactElement];
    const table = (content[1].props.children as React.ReactElement).props.children as React.ReactElement[];

    expect(table[1].props.emptyState).toBe("Sin negocio asociado");
  });

  it("passes a safe sales error to the table instead of treating it as zero results", async () => {
    const { auth } = await import("@/auth");
    vi.mocked(auth).mockResolvedValue({ user: { businessId: "business-1", role: "ADMIN" } } as never);
    getSalesAction.mockResolvedValue({
      sales: [],
      nextCursor: null,
      error: "No se pudieron cargar las ventas",
    });

    const result = await SearchBillContent({ searchParams: Promise.resolve({}) });
    const content = result.props.children as [React.ReactElement, React.ReactElement];
    const table = (content[1].props.children as React.ReactElement).props.children as React.ReactElement[];

    expect(table[1].props).toEqual(expect.objectContaining({
      emptyState: "No se pudieron cargar las ventas",
      sales: [],
      nextCursor: null,
    }));
  });
});
