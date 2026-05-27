import React from "react";
import { screen, fireEvent, render } from "../test-utils";
import { BillButtons } from "@/components/Billing/BillButtons";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFeatures } from "@/hooks/useFeatures";

vi.mock("@/hooks/useFeatures", () => ({
  useFeatures: vi.fn(),
}));

describe("BillButtons Point of Sale Component Test Suite", () => {
  const onStandard = vi.fn();
  const onLedger = vi.fn();
  const onAfip = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render standard cash checkout but disabled locked features in BASIC plan", () => {
    vi.mocked(useFeatures).mockReturnValue({
      plan: "BASIC",
      hasFeature: (key: string) => false,
      isDelinquent: false,
    } as any);

    render(
      <BillButtons
        onStandardCheckout={onStandard}
        onLedgerCheckout={onLedger}
        onAfipCheckout={onAfip}
      />
    );

    // Standard button is active
    const standardBtn = screen.getByRole("button", { name: /Efectivo \/ Débito/i });
    expect(standardBtn).not.toBeDisabled();

    // Credit Ledger and AFIP buttons are disabled due to feature lock
    const ledgerBtn = screen.getByRole("button", { name: /Cargar a Cuenta Corriente/i });
    const afipBtn = screen.getByRole("button", { name: /Facturación Electrónica/i });

    expect(ledgerBtn).toBeDisabled();
    expect(afipBtn).toBeDisabled();
  });

  it("should trigger standard callback but ignore locks when clicked", () => {
    vi.mocked(useFeatures).mockReturnValue({
      plan: "BASIC",
      hasFeature: () => false,
      isDelinquent: false,
    } as any);

    render(
      <BillButtons
        onStandardCheckout={onStandard}
        onLedgerCheckout={onLedger}
        onAfipCheckout={onAfip}
      />
    );

    const standardBtn = screen.getByRole("button", { name: /Efectivo \/ Débito/i });
    fireEvent.click(standardBtn);
    expect(onStandard).toHaveBeenCalledTimes(1);
  });

  it("should enable and trigger F2 and F3 checkouts if features are enabled in premium tiers", () => {
    vi.mocked(useFeatures).mockReturnValue({
      plan: "ENTERPRISE",
      hasFeature: (key: string) => true,
      isDelinquent: false,
    } as any);

    render(
      <BillButtons
        onStandardCheckout={onStandard}
        onLedgerCheckout={onLedger}
        onAfipCheckout={onAfip}
      />
    );

    const ledgerBtn = screen.getByRole("button", { name: /Cargar a Cuenta Corriente/i });
    const afipBtn = screen.getByRole("button", { name: /Facturación Electrónica/i });

    expect(ledgerBtn).not.toBeDisabled();
    expect(afipBtn).not.toBeDisabled();

    fireEvent.click(ledgerBtn);
    expect(onLedger).toHaveBeenCalledTimes(1);

    fireEvent.click(afipBtn);
    expect(onAfip).toHaveBeenCalledTimes(1);
  });

  it("should block all checkout options if business account is MOROSO (delinquent)", () => {
    vi.mocked(useFeatures).mockReturnValue({
      plan: "ENTERPRISE",
      hasFeature: () => true,
      isDelinquent: true,
    } as any);

    render(
      <BillButtons
        onStandardCheckout={onStandard}
        onLedgerCheckout={onLedger}
        onAfipCheckout={onAfip}
      />
    );

    expect(screen.getByRole("button", { name: /Efectivo \/ Débito/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cargar a Cuenta Corriente/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Facturación Electrónica/i })).toBeDisabled();
  });
});
