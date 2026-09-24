import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("auth-scoped sales action boundary", () => {
  it("creates exactly one module-level server boundary and exports getSalesAction", () => {
    const action = source("src/actions/sales/get-sales.ts");
    expect(action.match(/^[ \t]*[\"']use server[\"'];?/m)).not.toBeNull();
    expect(action.match(/^[ \t]*[\"']use server[\"'];?/gm)).toHaveLength(1);
    expect(action).toMatch(/export\s+(?:(?:async\s+)?function\s+getSalesAction|const\s+getSalesAction\s*=)/);
  });

  it("makes authorization action-owned and keeps the public input pagination-only", () => {
    const action = source("src/actions/sales/get-sales.ts");
    expect(action).toMatch(/auth\s*\(\s*\)/);
    expect(action).toMatch(/session[\s\S]{0,160}user[\s\S]{0,80}businessId/);
    expect(action).toMatch(/paidStatus\s*:\s*[\"']pago[\"']/);
    expect(action).not.toMatch(/params[^\n]*businessId|params[^\n]*session|params[^\n]*userId/);
  });

  it("uses the dedicated client import, preserves page auth, and keeps history non-server", () => {
    const table = source("src/components/Billing/SalesTable.tsx");
    const page = source("src/app/(protected)/searchBill/page.tsx");
    const history = source("src/actions/sales/history.ts");
    const barrel = source("src/actions/sales/index.ts");

    expect(table).toContain('from "@/actions/sales/get-sales"');
    expect(table).not.toContain('from "@/actions/sales"');
    expect(table).not.toMatch(/from\s+["']@\/auth|from\s+["']@\/lib\/db/);
    expect(page).toMatch(/auth\s*\(\s*\)/);
    expect(page).toContain('from "@/actions/sales/get-sales"');
    expect(history).not.toMatch(/^\s*["']use server["']/m);
    expect(history).toMatch(/mapOrderToBillState/);
    expect(barrel).toMatch(/(?:export|from)[^\n]*get-sales|export \* from ["']\.\/history["']/);
  });
});
