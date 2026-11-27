import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const content = readFileSync(join(root, "src", "app", "(protected)", "account-ledger", "AccountLedgerContent.tsx"), "utf8");
const page = readFileSync(join(root, "src", "app", "(protected)", "account-ledger", "page.tsx"), "utf8");

describe("Fichero bounded account-ledger UI contract", () => {
  it("uses a bounded first page for Todos and preserves cursor navigation", () => {
    expect(content).toMatch(/status: activeTab/);
    expect(content).toMatch(/limit: isInfinite \? INFINITE_LIMIT : ITEMS_PER_PAGE/);
    expect(content).toMatch(/cursor,/);
    expect(content).toMatch(/goNextWindow/);
    expect(content).toMatch(/goPrevWindow/);
  });

  it("does not hide action errors and offers retry", () => {
    expect(content).toMatch(/serverError/);
    expect(content).toMatch(/No se pudieron cargar las órdenes/);
    expect(content).toMatch(/Reintentar/);
  });

  it("distinguishes a true empty ledger from an unavailable feature or business", () => {
    expect(content).toMatch(/No hay cuentas pendientes/);
    expect(page).toMatch(/Funcionalidad no disponible/);
    expect(page).toMatch(/no tiene un negocio asociado/);
    expect(page).toMatch(/hasClientLedger/);
  });
});
