import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PeriodicReport, { getReportRange } from "@/components/PeriodicReport";
import { getDailyReportAction } from "@/actions/sales";

vi.mock("@/actions/sales", () => ({
  getDailyReportAction: vi.fn(),
}));

vi.mock("@/lib/pusher-client", () => ({
  pusherClient: {
    subscribe: vi.fn(() => ({ bind: vi.fn(), unbind: vi.fn() })),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/StockActivityModal", () => ({
  default: () => null,
}));

const report = {
  totalSales: 1200,
  orderCount: 3,
  totalDiscounts: 20,
  totalReturns: 0,
  returnCount: 0,
  netTotal: 1200,
  paymentMethods: { Efectivo: 1200 },
  stockMovementCount: 1,
  stockActivity: { ins: [], outs: [] },
};

describe("PeriodicReport", () => {
  beforeEach(() => {
    vi.mocked(getDailyReportAction).mockReset();
  });

  it("calculates inclusive ranges for each report period", () => {
    const selectedDate = new Date(2026, 1, 15);

    expect(getReportRange("daily", selectedDate)).toEqual({
      startDate: selectedDate,
      endDate: selectedDate,
    });
    expect(getReportRange("monthly", selectedDate).startDate.getDate()).toBe(1);
    expect(getReportRange("monthly", selectedDate).endDate.getDate()).toBe(28);
    expect(getReportRange("yearly", selectedDate).startDate.getMonth()).toBe(0);
    expect(getReportRange("yearly", selectedDate).endDate.getMonth()).toBe(11);
  });

  it("shows an actionable error instead of keeping silent or stale data", async () => {
    vi.mocked(getDailyReportAction).mockResolvedValue({ error: "Error al generar el reporte" });

    render(<PeriodicReport period="daily" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Error al generar el reporte");
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  it("renders report data with labeled period controls", async () => {
    vi.mocked(getDailyReportAction).mockResolvedValue({ success: true, data: report });

    render(<PeriodicReport period="daily" />);

    expect((await screen.findAllByText("$1.200,00")).length).toBe(3);
    expect(screen.getByRole("button", { name: /día anterior/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /día siguiente/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ver ventas/i })).toBeInTheDocument();
  });

  it("loads a historic range when navigating to the previous period", async () => {
    vi.mocked(getDailyReportAction).mockResolvedValue({ success: true, data: report });

    render(<PeriodicReport period="daily" />);
    await screen.findAllByText("$1.200,00");
    const previous = screen.getByRole("button", { name: /día anterior/i });

    previous.click();

    await waitFor(() => expect(getDailyReportAction).toHaveBeenCalledTimes(2));
    const [, historicEnd] = vi.mocked(getDailyReportAction).mock.calls[1];
    expect(historicEnd.getTime()).toBeLessThan(Date.now());
  });

  it("limits money values to two decimal places", async () => {
    vi.mocked(getDailyReportAction).mockResolvedValue({
      success: true,
      data: { ...report, totalSales: 1200.129, netTotal: 1200.1 },
    });

    render(<PeriodicReport period="daily" />);

    expect(await screen.findByText("$1.200,13")).toBeInTheDocument();
    expect(screen.getByText("$1.200,10")).toBeInTheDocument();
    expect(screen.queryByText("$1.200,129")).not.toBeInTheDocument();
  });

  it("keeps loading status bounded to the report surface", () => {
    vi.mocked(getDailyReportAction).mockReturnValue(new Promise(() => undefined));

    const { container } = render(<PeriodicReport period="daily" />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Cargando reporte");
    expect(status).toHaveClass("py-4");
    expect(status).not.toHaveClass("fixed");
    expect(container.querySelector(".fixed.inset-0")).not.toBeInTheDocument();
  });
});
