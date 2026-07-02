// @vitest-environment node
import { describe, it, expect } from "vitest";
import { roundToNearest10 } from "@/utils/round-to-nearest-10";

describe("roundToNearest10", () => {
  it("rounds 1953 down to 1950", () => {
    expect(roundToNearest10(1953)).toBe(1950);
  });

  it("rounds 1934.24 down to 1930", () => {
    expect(roundToNearest10(1934.24)).toBe(1930);
  });

  it("rounds 1935 up to 1940 (rounds half up)", () => {
    expect(roundToNearest10(1935)).toBe(1940);
  });

  it("rounds 1939 up to 1940", () => {
    expect(roundToNearest10(1939)).toBe(1940);
  });

  it("handles zero", () => {
    expect(roundToNearest10(0)).toBe(0);
  });

  it("returns same value for already-multiple of 10", () => {
    expect(roundToNearest10(1000)).toBe(1000);
  });

  it("rounds 999999.99 to 1000000", () => {
    expect(roundToNearest10(999999.99)).toBe(1000000);
  });

  it("rounds large numbers correctly within safe integer range", () => {
    expect(roundToNearest10(123456789)).toBe(123456790);
  });

  it("handles floating-point precision artifacts (0.1+0.2 rounds to 0)", () => {
    expect(roundToNearest10(0.1 + 0.2)).toBe(0);
  });
});
