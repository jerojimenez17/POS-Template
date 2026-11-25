import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("account-level fiscal Client editing placement", () => {
  it("renders one populated account Client editor outside the payment-row map", () => {
    const page = source("src/app/(protected)/account-ledger/[id]/page.tsx");
    const editorPosition = page.indexOf("<PaymentVoucherClientEditDialog");
    const paymentRowsPosition = page.indexOf("paymentAmounts.map(");

    expect(editorPosition).toBeGreaterThan(-1);
    expect(paymentRowsPosition).toBeGreaterThan(-1);
    expect(editorPosition).toBeLessThan(paymentRowsPosition);
    expect(page.match(/<PaymentVoucherClientEditDialog\b/g)).toHaveLength(1);
    expect(page).toMatch(/<button[^>]*>[\s\S]*?order\.client\?\.name[\s\S]*?<\/button>/);
    expect(page).toMatch(/clientFiscalData/);
  });

  it("keeps payment-row controls limited to that payment's voucher lifecycle", () => {
    const row = source("src/components/account-ledger/PaymentVoucherRowActionClient.tsx");

    expect(row).not.toMatch(/PaymentVoucherClientEditDialog/);
    expect(row).not.toMatch(/updateClient/);
    expect(row).not.toMatch(/Editar datos fiscales del cliente/);
  });
});
