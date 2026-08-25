import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const featureDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(featureDirectory, "..", "..", "..");
const voucherPath = join(repositoryRoot, "src", "actions", "voucher.ts");
const pointSaleValidationPath = join(
  repositoryRoot,
  "src",
  "services",
  "afip",
  "point-sale-validation.ts",
);

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

function collectTypeScriptFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("voucher Server Action / parser module boundary", () => {
  it("declares exactly one module-level use server directive", () => {
    const source = readSource(voucherPath);
    const directives = source.match(/["']use server["']/g) ?? [];

    expect(directives).toHaveLength(1);
    expect(source.trimStart().startsWith('"use server"')).toBe(true);
  });

  it("keeps getVoucherNumberAction as the named action with its contract", () => {
    const source = readSource(voucherPath);

    expect(source).toMatch(
      /export\s+const\s+getVoucherNumberAction\s*=\s*async\s*\([\s\S]*?puntoVenta:\s*number\s*,\s*tipoFactura:\s*number\s*\)\s*:\s*Promise<VoucherNumberResult>/,
    );
    expect(source).toMatch(/export\s+interface\s+VoucherNumberResult\b/);
  });

  it("imports the parser from the pure service and does not re-export it", () => {
    const source = readSource(voucherPath);

    expect(source).toMatch(
      /import\s*\{[\s\S]*?\bparseAfipPointSaleError\b[\s\S]*?\}\s*from\s*["']@\/services\/afip\/point-sale-validation["']/,
    );
    expect(source).not.toMatch(
      /export\s*\{[\s\S]*?\bparseAfipPointSaleError\b[\s\S]*?\}\s*from/,
    );
    expect(readSource(pointSaleValidationPath)).toMatch(
      /export\s+(?:function|const)\s+parseAfipPointSaleError\b/,
    );
  });

  it("has no productive or test import of the parser through actions/voucher", () => {
    const roots = ["src", "tests", "ai/features"];
    const forbiddenImports: string[] = [];

    for (const root of roots) {
      for (const path of collectTypeScriptFiles(join(repositoryRoot, root))) {
        if (path === fileURLToPath(import.meta.url)) continue;
        const source = readSource(path);
        if (
          /(?:import|export)\s+(?:type\s+)?\{[^}]*\bparseAfipPointSaleError\b[^}]*\}\s+from\s+["']@\/actions\/voucher["']/.test(
            source,
          )
        ) {
          forbiddenImports.push(relative(repositoryRoot, path));
        }
      }
    }

    expect(forbiddenImports).toEqual([]);
  });

  it("keeps the client boundary importing the action by its stable path", () => {
    const formPath = join(
      repositoryRoot,
      "src",
      "components",
      "Billing",
      "BillParametersForm.tsx",
    );
    const source = readSource(formPath);

    expect(source).toMatch(
      /import\s*\{[\s\S]*?\bgetVoucherNumberAction\b[\s\S]*?\}\s+from\s+["']@\/actions\/voucher["']/,
    );
  });
});
