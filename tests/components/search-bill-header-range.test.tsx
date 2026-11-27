import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { initFromUrl } = vi.hoisted(() => ({ initFromUrl: vi.fn() }));

vi.mock("@/context/FiltersContext/FiltersContext", () => ({
  FiltersContext: { _currentValue: { initFromUrl } },
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("lucide-react", () => ({ ArrowLeft: () => null, Search: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

import SearchBillHeader from "@/components/Billing/SearchBillHeader";

describe("SearchBillHeader report date initialization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes the public inclusive end date at local end-of-day", async () => {
    render(<SearchBillHeader initialParams={{ from: "2026-10-01", to: "2026-10-05", showAll: "true" }} canViewAllSellers />);

    await waitFor(() => expect(initFromUrl).toHaveBeenCalledTimes(1));
    const [{ startDate, endDate, showAll }] = initFromUrl.mock.calls[0];
    expect(startDate).toEqual(new Date(2026, 9, 1));
    expect(endDate).toEqual(new Date(2026, 9, 5, 23, 59, 59, 999));
    expect(showAll).toBe(true);
  });

  it("does not initialize filters for a non-report visit", () => {
    render(<SearchBillHeader />);

    expect(initFromUrl).not.toHaveBeenCalled();
  });

  it("clears the date and default payment/document filters on a direct visit", async () => {
    render(<SearchBillHeader directVisit />);

    await waitFor(() => expect(initFromUrl).toHaveBeenCalledWith({ directVisit: true }));
  });
});
