import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Serializer = (state: unknown) => Record<string, unknown>;
const utilityFile = resolve(process.cwd(), "src/components/Billing/serialize-sales-filters.ts");

async function loadSerializer(): Promise<Serializer> {
  expect(existsSync(utilityFile)).toBe(true);
  if (!existsSync(utilityFile)) return () => ({});
   const loadedModule = await import(/* @vite-ignore */ pathToFileURL(utilityFile).href) as { serializeSalesFilters: Serializer };
   return loadedModule.serializeSalesFilters;
}

describe("serializeSalesFilters", () => {
  it("maps active document types, payment methods, seller, and ISO dates", () => {
    return loadSerializer().then((serializeSalesFilters) => expect(serializeSalesFilters({
      Remito: { active: true, filter: "remito" },
      FacturaC: { active: true, filter: "facturac" },
      Efectivo: { active: true, filter: "efectivo" },
      Debito: { active: false, filter: "debito" },
      UnPago: { active: false, filter: "Credito 1 pago" },
      Ahora3: { active: false, filter: "ahora 3" },
      Ahora6: { active: false, filter: "ahora 6" },
      Transferencia: { active: false, filter: "transferencia" },
      CuentaDNI: { active: false, filter: "cuentaDNI" },
      Seller: { active: true, filter: "Ana" },
      startDate: { active: true, date: new Date("2026-02-01T00:00:00.000Z") },
      endDate: { active: true, date: new Date("2026-02-28T23:59:59.999Z") },
    })).toEqual({
      documentTypes: ["REMITO", "FACTURA_C"],
      paymentMethods: ["efectivo"],
      seller: "Ana",
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: "2026-02-28T23:59:59.999Z",
    }));
  });

  it("does not mutate state and serializes inactive or empty selections as unrestricted", async () => {
    const serializeSalesFilters = await loadSerializer();
    const state = { Remito: { active: false, filter: "remito" }, FacturaC: { active: false, filter: "facturac" }, Seller: { active: false, filter: "Seleccionar Vendedor" }, startDate: { active: false, date: new Date() }, endDate: { active: false, date: new Date() } } as never;
    const before = JSON.stringify(state);
    expect(serializeSalesFilters(state)).toEqual({ documentTypes: [], paymentMethods: [] });
    expect(JSON.stringify(state)).toBe(before);
  });
});
