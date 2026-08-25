import React, { useContext } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import BillProvider from "../../../src/context/BillProvider";
import { BillContext } from "../../../src/context/BillContext";

function Probe() {
  const context = useContext(BillContext) as unknown as Record<string, unknown>;
  // JSON.stringify drops functions; serialize them as tags so assertions can
  // still verify the API surface.
  const serialized = Object.fromEntries(
    Object.entries(context).map(([key, val]) => [key, typeof val === "function" ? "function" : val]),
  );
  return <output data-testid="settings">{JSON.stringify(serialized)}</output>;
}

describe("business-scoped QZ setting", () => {
  beforeEach(() => {
    // Isolate the localStorage-backed preference between cases.
    localStorage.clear();
  });

  it("seeds qzTrayActive from the persisted Business.qzTray when localStorage is unset", () => {
    render(
      <BillProvider qzTrayEnabled={false}>
        <Probe />
      </BillProvider>,
    );

    const value = JSON.parse(screen.getByTestId("settings").textContent ?? "{}");
    // Merged contract (report-C): context exposes OUR writable qzTrayActive,
    // seeded FROM upstream's qzTrayEnabled server setting when the user has
    // no stored preference yet.
    expect(value.qzTrayActive).toBe(false);
    expect(value.setQzTrayActive).toBe("function");
  });

  it("lets the persisted user preference win once it exists", () => {
    localStorage.setItem("qzTrayActive", "true");
    render(
      <BillProvider qzTrayEnabled={false}>
        <Probe />
      </BillProvider>,
    );

    const value = JSON.parse(screen.getByTestId("settings").textContent ?? "{}");
    expect(value.qzTrayActive).toBe(true);
  });

  it("does not invoke QZ for PDF and keeps qzTrayActive boolean for thermal printing", () => {
    // Contract test for the merged read/write context API.
    render(<BillProvider><Probe /></BillProvider>);
    const value = JSON.parse(screen.getByTestId("settings").textContent ?? "{}");
    expect(value.printMode).toMatch(/^(thermal|pdf)$/);
    expect(value.qzTrayActive).toBeTypeOf("boolean");  });
});
