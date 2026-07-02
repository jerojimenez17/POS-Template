import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InlineAmountInput from "../InlineAmountInput";

describe("InlineAmountInput Component", () => {
  describe("AC-01: Display Mode", () => {
    it("renders a <span> (not an <input>) showing the amount text", () => {
      const { container } = render(
        <InlineAmountInput amount={5} productId="prod-1" updateAmount={vi.fn()} />,
      );

      const span = container.querySelector("span");
      expect(span).toBeTruthy();
      expect(container.querySelector("input")).toBeNull();
    });

    it("the span has the text content equal to the amount prop", () => {
      render(
        <InlineAmountInput amount={3} productId="prod-1" updateAmount={vi.fn()} />,
      );

      expect(screen.getByText("3")).toBeTruthy();
    });
  });

  describe("AC-02: Enter Edit Mode on Double-Click", () => {
    it("double-clicking on the span switches to an <input> element", () => {
      const { container } = render(
        <InlineAmountInput amount={5} productId="prod-1" updateAmount={vi.fn()} />,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input");
      expect(input).toBeTruthy();
      expect(container.querySelector("span")).toBeNull();
    });

    it("the input is pre-filled with the current amount", () => {
      const { container } = render(
        <InlineAmountInput amount={7} productId="prod-1" updateAmount={vi.fn()} />,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("7");
    });

    it("the input has inputMode='numeric'", () => {
      const { container } = render(
        <InlineAmountInput amount={5} productId="prod-1" updateAmount={vi.fn()} />,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input") as HTMLInputElement;
      expect(input.getAttribute("inputmode")).toBe("numeric");
    });
  });

  describe("AC-03: Save on Enter Key", () => {
    it("pressing Enter after changing value calls updateAmount with the new value", () => {
      const updateAmount = vi.fn();
      const { container } = render(
        <InlineAmountInput amount={3} productId="prod-1" updateAmount={updateAmount} />,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "5" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(updateAmount).toHaveBeenCalledWith("prod-1", 5);
    });

    it("returns to display mode after Enter (span visible, input gone)", () => {
      const { container } = render(
        <InlineAmountInput amount={3} productId="prod-1" updateAmount={vi.fn()} />,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "5" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(container.querySelector("span")).toBeTruthy();
      expect(container.querySelector("input")).toBeNull();
    });
  });

  describe("AC-04: Save on Blur", () => {
    it("blurring the input after changing value calls updateAmount with the new value", () => {
      const updateAmount = vi.fn();
      const { container } = render(
        <div>
          <InlineAmountInput amount={3} productId="prod-1" updateAmount={updateAmount} />
        </div>,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "8" } });
      fireEvent.blur(input);

      expect(updateAmount).toHaveBeenCalledWith("prod-1", 8);
    });

    it("returns to display mode after blur", () => {
      const { container } = render(
        <div>
          <InlineAmountInput amount={3} productId="prod-1" updateAmount={vi.fn()} />
        </div>,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "8" } });
      fireEvent.blur(input);

      expect(container.querySelector("span")).toBeTruthy();
      expect(container.querySelector("input")).toBeNull();
    });
  });

  describe("AC-05: Cancel on Escape Key", () => {
    it("pressing Escape does NOT call updateAmount", () => {
      const updateAmount = vi.fn();
      const { container } = render(
        <InlineAmountInput amount={2} productId="prod-1" updateAmount={updateAmount} />,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "10" } });
      fireEvent.keyDown(input, { key: "Escape" });

      expect(updateAmount).not.toHaveBeenCalled();
    });

    it("returns to display mode showing the ORIGINAL amount after Escape", () => {
      const { container } = render(
        <InlineAmountInput amount={2} productId="prod-1" updateAmount={vi.fn()} />,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "10" } });
      fireEvent.keyDown(input, { key: "Escape" });

      const spanAfter = container.querySelector("span")!;
      expect(spanAfter.textContent).toBe("2");
    });
  });

  describe("AC-06: Reject Invalid Values", () => {
    it('entering empty string and blurring reverts to original, no update called', () => {
      const updateAmount = vi.fn();
      const { container } = render(
        <div>
          <InlineAmountInput amount={5} productId="prod-1" updateAmount={updateAmount} />
        </div>,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);

      expect(updateAmount).not.toHaveBeenCalled();
      const spanAfter = container.querySelector("span")!;
      expect(spanAfter.textContent).toBe("5");
    });

    it('entering "0" and pressing Enter reverts to original, no update called', () => {
      const updateAmount = vi.fn();
      const { container } = render(
        <InlineAmountInput amount={5} productId="prod-1" updateAmount={updateAmount} />,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "0" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(updateAmount).not.toHaveBeenCalled();
      const spanAfter = container.querySelector("span")!;
      expect(spanAfter.textContent).toBe("5");
    });

    it('entering "-1" and blurring reverts to original, no update called', () => {
      const updateAmount = vi.fn();
      const { container } = render(
        <div>
          <InlineAmountInput amount={5} productId="prod-1" updateAmount={updateAmount} />
        </div>,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "-1" } });
      fireEvent.blur(input);

      expect(updateAmount).not.toHaveBeenCalled();
      const spanAfter = container.querySelector("span")!;
      expect(spanAfter.textContent).toBe("5");
    });

    it('entering "abc" and pressing Enter reverts to original, no update called', () => {
      const updateAmount = vi.fn();
      const { container } = render(
        <InlineAmountInput amount={5} productId="prod-1" updateAmount={updateAmount} />,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "abc" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(updateAmount).not.toHaveBeenCalled();
      const spanAfter = container.querySelector("span")!;
      expect(spanAfter.textContent).toBe("5");
    });
  });

  describe("AC-07: Accept Decimal Values", () => {
    it('entering "2,5" (comma decimal) and blurring calls updateAmount with 2.5', () => {
      const updateAmount = vi.fn();
      const { container } = render(
        <div>
          <InlineAmountInput amount={1} productId="prod-1" updateAmount={updateAmount} />
        </div>,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "2,5" } });
      fireEvent.blur(input);

      expect(updateAmount).toHaveBeenCalledWith("prod-1", 2.5);
    });

    it('entering "1.5" (dot decimal) and pressing Enter calls updateAmount with 1.5', () => {
      const updateAmount = vi.fn();
      const { container } = render(
        <InlineAmountInput amount={1} productId="prod-1" updateAmount={updateAmount} />,
      );

      const span = container.querySelector("span")!;
      fireEvent.doubleClick(span);

      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "1.5" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(updateAmount).toHaveBeenCalledWith("prod-1", 1.5);
    });
  });
});
