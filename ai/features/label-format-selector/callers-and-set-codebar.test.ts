import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("superficies públicas y callers de impresión", () => {
  it("mantiene el contrato de CodeBarModal y separa SetCodebarModal de impresión", () => {
    const codebar = source("src/components/stock/code-bar-modal.tsx");
    const setter = source("src/components/stock/set-codebar-modal.tsx");
    expect(codebar).toMatch(/interface Props[\s\S]*code:\s*string[\s\S]*codebar\?:\s*string[\s\S]*description:\s*string[\s\S]*salePrice:\s*number/);
    expect(codebar).toContain('format: "thermal"');
    expect(codebar).toContain('orientation: "landscape"');
    expect(setter).toContain('updateProduct(productId, { codebar: codebar.trim() })');
    expect(setter).toContain('onSuccess?.(codebar.trim())');
    expect(setter).not.toContain("ProductPrintModal");
    expect(setter).not.toContain("printElement");
  });

  it("preserva los callers: tabla individual, thermal explícito y bulk sin API nueva", () => {
    const stockTable = source("src/components/stock/stock-table.tsx");
    const productTable = source("src/components/ProductDataTable.tsx");
    const bulk = source("src/app/(protected)/stock/bulk-update/page.tsx");
    expect(stockTable).toContain('<CodeBarModal');
    expect(stockTable).toContain('codebar={product.codebar || undefined}');
    expect(stockTable).toContain('description={product.description || ""}');
    expect(productTable).toContain('<ProductPrintModal');
    expect(productTable).toContain('format="thermal"');
    expect(bulk).toContain('<ProductPrintModal');
    expect(bulk).toContain('products={selectedProducts}');
    expect(bulk).not.toContain('format="label-45x55"');
  });
});
