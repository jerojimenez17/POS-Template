import React from "react";
import { screen, render } from "../test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFeatures } from "@/hooks/useFeatures";
import BillButtonsDefault from "@/components/Billing/BillButtons";

vi.mock("@/hooks/useFeatures", () => ({
  useFeatures: vi.fn(),
}));

describe("BudgetButton feature gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render Presupuesto button when hasBudget is true", () => {
    vi.mocked(useFeatures).mockReturnValue({
      hasFeature: (key: string) => key === "hasBudget",
      plan: "ENTERPRISE",
      isDelinquent: false,
    } as any);

    render(
      <BillButtonsDefault
        session={null}
        handlePrint={vi.fn()}
      />
    );

    expect(screen.queryByText("Presupuesto")).not.toBeNull();
  });

  it("should NOT render Presupuesto button when hasBudget is false", () => {
    vi.mocked(useFeatures).mockReturnValue({
      hasFeature: () => false,
      plan: "BASIC",
      isDelinquent: false,
    } as any);

    render(
      <BillButtonsDefault
        session={null}
        handlePrint={vi.fn()}
      />
    );

    expect(screen.queryByText("Presupuesto")).toBeNull();
  });
});
