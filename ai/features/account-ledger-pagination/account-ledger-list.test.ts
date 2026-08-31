import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const featureDirectory = dirname(fileURLToPath(import.meta.url));
const listPath = join(
  featureDirectory,
  "..",
  "..",
  "..",
  "src",
  "app",
  "(protected)",
  "account-ledger",
  "AccountLedgerList.tsx",
);

const productionListSource = (): string => (existsSync(listPath) ? readFileSync(listPath, "utf8") : "");

describe("account ledger client pagination contract", () => {
  it("provides the future client list boundary as a client component", () => {
    expect(existsSync(listPath)).toBe(true);
    expect(readFileSync(listPath, "utf8")).toMatch(/use client/);
  });

  it("uses infinite scrolling only for pago/all and exposes an accessible sentinel", () => {
    const source = productionListSource();
    expect(source).toMatch(/IntersectionObserver/);
    expect(source).toMatch(/pago/);
    expect(source).toMatch(/all/);
    expect(source).toMatch(/sentinel|aria-label/i);
    expect(source).toMatch(/inpago|pendiente/);
  });

  it("prevents concurrent loads, resets on query changes, and supports retry/error states", () => {
    const source = productionListSource();
    expect(source).toMatch(/loadingMore/);
    expect(source).toMatch(/No se pudieron cargar más órdenes/);
    expect(source).toMatch(/reintentar|retry/i);
    expect(source).toMatch(/status[\s\S]*search|search[\s\S]*status/);
  });

  it("keeps fixed tabs explicit at 100 rows and replaces rather than concatenates pages", () => {
    const source = productionListSource();
    expect(source).toMatch(/100/);
    expect(source).toMatch(/previous|anterior/i);
    expect(source).toMatch(/next|siguiente/i);
    expect(source).toMatch(/set[A-Za-z]*\(result\.(orders|data)/);
  });
});
