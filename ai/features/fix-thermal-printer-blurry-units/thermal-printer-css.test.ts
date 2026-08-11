/**
 * thermal-printer-css.test.ts
 *
 * TDD tests for the "Fix blurry units on thermal printer ticket" feature.
 *
 * These tests verify that the `.product-price` CSS rule inside
 * `buildThermalPrintHTML()` in `src/lib/print/BrowserPrint.ts` has the correct
 * properties for thermal printer legibility:
 *   - font-size: 12px  (currently 11px → FAIL)
 *   - font-weight: 700 (currently not set → FAIL)
 *   - color: #000      (currently #555 → FAIL)
 *
 * The tests read the source file as text and extract the CSS rule directly,
 * since `buildThermalPrintHTML` is not exported.
 *
 * @see ai/features/fix-thermal-printer-blurry-units/SPEC.md
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Source file path ─────────────────────────────────────────────────────────
const SOURCE_FILE = resolve(
  __dirname,
  "../../../src/lib/print/BrowserPrint.ts"
);

// ── Read source once for all tests ──────────────────────────────────────────
let sourceCode: string;

beforeAll(() => {
  sourceCode = readFileSync(SOURCE_FILE, "utf-8");
});

// ── Helper: extract the .product-price CSS rule from the source ──────────────
function extractProductPriceCSS(src: string): string | null {
  // Match the .product-price CSS rule inside the <style> block.
  // The rule may span one line:  .product-price { font-size: 11px; color: #555; }
  const regex = /\.product-price\s*\{([^}]+)\}/;
  const match = src.match(regex);
  return match ? match[1].trim() : null;
}

// ── Helper: extract a single CSS property value from a rule body ─────────────
function getCSSProperty(
  ruleBody: string,
  property: string
): string | null {
  // Match `property: value;` — value may contain #, px, numbers, etc.
  const regex = new RegExp(`${property}\\s*:\\s*([^;]+)\\s*;?`);
  const match = ruleBody.match(regex);
  return match ? match[1].trim() : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Thermal printer CSS — .product-price rule", () => {
  describe("AC1: CSS rule exists in buildThermalPrintHTML()", () => {
    it("should contain a .product-price CSS rule in the source", () => {
      const ruleBody = extractProductPriceCSS(sourceCode);
      expect(ruleBody).not.toBeNull();
    });
  });

  describe("AC1: font-size is 12px (not 11px)", () => {
    it("should have font-size: 12px — RED test (currently 11px)", () => {
      const ruleBody = extractProductPriceCSS(sourceCode);
      expect(ruleBody).not.toBeNull();

      const fontSize = getCSSProperty(ruleBody!, "font-size");

      // The current code has font-size: 11px — this assertion will FAIL until
      // the developer changes it to 12px.
      expect(fontSize).toBe("12px");
    });
  });

  describe("AC1: font-weight is 700 (bold)", () => {
    it("should have font-weight: 700 — RED test (currently not set)", () => {
      const ruleBody = extractProductPriceCSS(sourceCode);
      expect(ruleBody).not.toBeNull();

      const fontWeight = getCSSProperty(ruleBody!, "font-weight");

      // The current code does NOT set font-weight, so this will be null.
      // After the fix, it should be "700".
      expect(fontWeight).toBe("700");
    });
  });

  describe("AC1: color is #000 (black, not #555 gray)", () => {
    it("should have color: #000 — RED test (currently #555)", () => {
      const ruleBody = extractProductPriceCSS(sourceCode);
      expect(ruleBody).not.toBeNull();

      const color = getCSSProperty(ruleBody!, "color");

      // The current code has color: #555 — this assertion will FAIL until
      // the developer changes it to #000.
      expect(color).toBe("#000");
    });
  });

  describe("Full rule verification (combined check)", () => {
    it("should contain the complete CSS rule: font-size: 12px; font-weight: 700; color: #000;", () => {
      const ruleBody = extractProductPriceCSS(sourceCode);
      expect(ruleBody).not.toBeNull();

      // Verify all three properties exist in the rule body with correct values.
      // This is a comprehensive check that the entire rule was updated.
      expect(ruleBody).toContain("font-size: 12px");
      expect(ruleBody).toContain("font-weight: 700");
      expect(ruleBody).toContain("color: #000");

      // Ensure old values are NOT present
      expect(ruleBody).not.toContain("font-size: 11px");
      expect(ruleBody).not.toContain("color: #555");
    });
  });

  describe("AC4: Layout — product-row uses flex-wrap (no breaking change)", () => {
    it("should preserve flex-wrap: wrap on .product-row", () => {
      const regex = /\.product-row\s*\{([^}]+)\}/;
      const match = sourceCode.match(regex);
      expect(match).not.toBeNull();

      const ruleBody = match![1];
      expect(ruleBody).toContain("flex-wrap: wrap");
    });
  });

  describe("Regression: product-sum retains font-weight: 700", () => {
    it("should not accidentally modify .product-sum styling", () => {
      const regex = /\.product-sum\s*\{([^}]+)\}/;
      const match = sourceCode.match(regex);
      expect(match).not.toBeNull();

      const ruleBody = match![1];
      expect(ruleBody).toContain("font-weight: 700");
      expect(ruleBody).toContain("font-size: 13px");
    });
  });

  describe("Regression: only .product-price CSS is changed (no other rules modified)", () => {
    it("should still have font-size: 12.5px on .product-desc", () => {
      const regex = /\.product-desc\s*\{([^}]+)\}/;
      const match = sourceCode.match(regex);
      expect(match).not.toBeNull();

      const ruleBody = match![1];
      expect(ruleBody).toContain("font-size: 12.5px");
    });
  });
});
