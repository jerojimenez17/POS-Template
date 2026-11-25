import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportLoadingFallback } from "@/app/(protected)/report/page";

vi.mock("@/components/PeriodicReport", () => ({
  default: () => null,
}));

vi.mock("@/components/report/ReportHeader", () => ({
  default: () => null,
}));

describe("Report page loading fallback", () => {
  it("renders an accessible bounded status without a fixed overlay", () => {
    const { container } = render(<ReportLoadingFallback />);

    const status = screen.getByRole("status", { name: "Cargando reporte" });

    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("rounded-xl", "bg-card");
    expect(status).not.toHaveClass("fixed", "inset-0");
    expect(container.querySelector(".fixed.inset-0")).not.toBeInTheDocument();
  });
});
