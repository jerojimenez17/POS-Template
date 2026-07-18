// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { OverdueIndicator } from "@/components/ui/OverdueIndicator";

// ── Mock Radix UI Tooltip ──────────────────────────────────────────────
// We mock the Tooltip primitives to avoid depending on Portal/Provider setup
// and to make assertions about tooltip content straightforward.
vi.mock("@radix-ui/react-tooltip", () => ({
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children, asChild, ...props }: any) => (
    <span data-testid="tooltip-trigger" {...props}>
      {children}
    </span>
  ),
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Content: ({ children, ...props }: any) => (
    <div data-testid="tooltip-content" {...props}>
      {children}
    </div>
  ),
  Arrow: ({ ...props }: any) => <div data-testid="tooltip-arrow" {...props} />,
}));

describe("OverdueIndicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────
  // AC-01: Component renders a red circle indicator
  // ──────────────────────────────────────────────
  it("AC-01: renders a red circle element", () => {
    render(<OverdueIndicator />);
    // The indicator should be a span with bg-red-500 and rounded-full classes
    const indicator = document.querySelector(
      ".bg-red-500.rounded-full"
    );
    expect(indicator).toBeInTheDocument();
  });

  it("AC-01: red circle has the correct sizing classes", () => {
    render(<OverdueIndicator />);
    const indicator = document.querySelector(
      ".bg-red-500.rounded-full"
    );
    // Should be 10px (w-2.5 h-2.5 in Tailwind = 10px)
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass("w-2.5", "h-2.5");
  });

  it("AC-01: red circle has cursor-help indicating an interactive tooltip", () => {
    render(<OverdueIndicator />);
    const indicator = document.querySelector(
      ".bg-red-500.rounded-full"
    );
    expect(indicator).toHaveClass("cursor-help");
  });

  // ──────────────────────────────────────────────
  // AC-05: Tooltip shows descriptive text on hover
  // ──────────────────────────────────────────────
  it("AC-05: renders tooltip content with the expected overdue message", () => {
    render(<OverdueIndicator />);
    const tooltipContent = screen.getByTestId("tooltip-content");
    expect(tooltipContent).toBeInTheDocument();
    expect(tooltipContent).toHaveTextContent(
      "Moroso — más de 30 días sin pagar"
    );
  });

  // ──────────────────────────────────────────────
  // AC-09 / Accessibility: aria-label for screen readers
  // ──────────────────────────────────────────────
  it("AC-09: includes an aria-label for accessibility", () => {
    render(<OverdueIndicator />);
    // The trigger element (or the indicator itself) should have aria-label
    const trigger = screen.getByTestId("tooltip-trigger");
    const ariaLabel =
      trigger.getAttribute("aria-label") ||
      trigger.querySelector("[aria-label]")?.getAttribute("aria-label");
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel?.toLowerCase()).toContain("moroso");
  });

  // ──────────────────────────────────────────────
  // AC-05: Tooltip arrow is rendered
  // ──────────────────────────────────────────────
  it("AC-05: renders tooltip arrow element", () => {
    render(<OverdueIndicator />);
    expect(screen.getByTestId("tooltip-arrow")).toBeInTheDocument();
  });

  // ──────────────────────────────────────────────
  // AC-09 (partial): Component is a span element (no unwanted wrapper)
  // ──────────────────────────────────────────────
  it("renders without crashing and produces exactly one trigger element", () => {
    render(<OverdueIndicator />);
    const trigger = screen.getByTestId("tooltip-trigger");
    expect(trigger).toBeInTheDocument();
  });

  // ──────────────────────────────────────────────
  // Edge case: Tooltip content does not appear when not hovered
  // (the mock always renders content, but the real component should only
  //  show content on hover — we document this expectation)
  // ──────────────────────────────────────────────
  it("tooltip trigger wraps the red dot", () => {
    render(<OverdueIndicator />);
    const trigger = screen.getByTestId("tooltip-trigger");
    const redDot = trigger.querySelector(".bg-red-500.rounded-full");
    expect(redDot).toBeInTheDocument();
  });
});
