import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("G2 — callers y superficie de asignación", () => {
  it("mantiene callers existentes sin API de impresión nueva", () => {
    const stock = source("src/components/stock/stock-table.tsx"); const products = source("src/components/ProductDataTable.tsx"); const bulk = source("src/app/(protected)/stock/bulk-update/page.tsx");
    expect(stock).toContain("<CodeBarModal"); expect(stock).toContain("codebar={product.codebar || undefined}"); expect(products).toContain('format="thermal"'); expect(bulk).toContain("<ProductPrintModal"); expect(bulk).not.toContain('format="label-45x55"');
  });
  it("mantiene SetCodebarModal separado de impresión", () => {
    const setter = source("src/components/stock/set-codebar-modal.tsx");
    expect(setter).toContain("updateProduct(productId, { codebar: codebar.trim() })"); expect(setter).toContain("onSuccess?.(codebar.trim())"); expect(setter).not.toMatch(/ProductPrintModal|printElement|JsBarcode/);
  });
});
