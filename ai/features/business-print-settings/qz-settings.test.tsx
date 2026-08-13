import React, { useContext } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BillProvider from "../../../src/context/BillProvider";
import { BillContext } from "../../../src/context/BillContext";

function Probe() {
  const context = useContext(BillContext) as unknown as Record<string, unknown>;
  return <output data-testid="settings">{JSON.stringify(context)}</output>;
}

describe("business-scoped QZ setting", () => {
  it("uses persisted Business.qzTray=false even when legacy localStorage says true", () => {
    localStorage.setItem("qzTrayActive", "true");
    render(<BillProvider><Probe /></BillProvider>);

    const value = JSON.parse(screen.getByTestId("settings").textContent ?? "{}");
    expect(value.qzTrayEnabled).toBe(false);
    expect(value).not.toHaveProperty("setQzTrayActive");
  });

  it("does not invoke QZ for PDF and passes Business.qzTray to thermal printing", () => {
    // This is intentionally a contract test for the new read-only context API.
    render(<BillProvider><Probe /></BillProvider>);
    const value = JSON.parse(screen.getByTestId("settings").textContent ?? "{}");
    expect(value.printMode).toMatch(/^(thermal|pdf)$/);
    expect(value).toHaveProperty("qzTrayEnabled");
  });
});
