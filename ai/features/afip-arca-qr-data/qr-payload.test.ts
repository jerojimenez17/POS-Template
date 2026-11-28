import { describe, expect, it, vi } from "vitest";

const VALID_PAYLOAD = {
  ver: 1,
  fecha: "2026-04-09",
  cuit: 30712345678,
  ptoVta: 12,
  tipoCmp: 6,
  nroCmp: 345,
  importe: 2750,
  moneda: "PES",
  ctz: 1,
  tipoDocRec: 99,
  nroDocRec: 0,
  tipoCodAut: "E",
  codAut: 12345678901234,
};

const PAYLOAD_KEYS = [
  "ver", "fecha", "cuit", "ptoVta", "tipoCmp", "nroCmp", "importe",
  "moneda", "ctz", "tipoDocRec", "nroDocRec", "tipoCodAut", "codAut",
];

async function loadQrPayloadModule(): Promise<Record<string, unknown> | null> {
  try {
    // Keep the anticipated implementation import dynamic so G2 TypeScript
    // compilation does not depend on the not-yet-created production module.
    return await vi.importActual<Record<string, unknown>>("@/services/afip/qr-payload");
  } catch {
    return null;
  }
}

function getBuilder(module: Record<string, unknown> | null): ((payload: unknown) => unknown) | null {
  expect(module, "The AFIP QR payload helper must be implemented").not.toBeNull();
  const builder = module?.buildArcaQrUrl;
  expect(typeof builder, "The helper must export buildArcaQrUrl(payload)").toBe("function");
  return typeof builder === "function" ? builder as (payload: unknown) => unknown : null;
}

function decodeUrlPayload(value: string): unknown {
  const url = new URL(value);
  expect(url.origin + url.pathname).toBe("https://www.afip.gob.ar/fe/qr/");
  expect([...url.searchParams.keys()]).toEqual(["p"]);
  const bytes = Uint8Array.from(atob(url.searchParams.get("p") ?? ""), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

describe("ARCA QR payload URL contract", () => {
  it("serializes exactly thirteen ordered keys with confirmed contract constants", async () => {
    const builder = getBuilder(await loadQrPayloadModule());
    if (!builder) return;

    const url = builder(VALID_PAYLOAD);
    expect(typeof url).toBe("string");
    if (typeof url !== "string") return;

    const parsed = decodeUrlPayload(url) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(PAYLOAD_KEYS);
    expect(parsed).toEqual(VALID_PAYLOAD);
    expect(parsed).toMatchObject({ ver: 1, moneda: "PES", ctz: 1, tipoCodAut: "E" });
  });

  it.each([
    ["CUIT receptor", { tipoDocRec: 80, nroDocRec: 20345678901 }],
    ["DNI receptor", { tipoDocRec: 96, nroDocRec: 12345678 }],
    ["Consumidor Final sin documento", { tipoDocRec: 99, nroDocRec: 0 }],
  ])("serializes the confirmed document mapping for %s", async (_name, recipient) => {
    const builder = getBuilder(await loadQrPayloadModule());
    if (!builder) return;

    const url = builder({ ...VALID_PAYLOAD, ...recipient });
    expect(typeof url).toBe("string");
    if (typeof url !== "string") return;
    expect(decodeUrlPayload(url)).toMatchObject(recipient);
  });

  it.each([
    ["impossible civil date", { fecha: "2026-02-30" }],
    ["non-ISO date", { fecha: "09/04/2026" }],
    ["wrong version", { ver: 2 }],
    ["wrong currency", { moneda: "ARS" }],
    ["wrong exchange rate", { ctz: 0 }],
    ["wrong authorization code type", { tipoCodAut: "A" }],
    ["unknown recipient document type", { tipoDocRec: 99, nroDocRec: 123 }],
    ["unsafe authorization number", { codAut: Number.MAX_SAFE_INTEGER + 1 }],
    ["non-positive amount", { importe: 0 }],
    ["extra field", { unexpected: "not part of the contract" }],
    ["null field", { cuit: null }],
  ])("rejects %s rather than producing a local URL", async (_name, override) => {
    const builder = getBuilder(await loadQrPayloadModule());
    if (!builder) return;

    expect(builder({ ...VALID_PAYLOAD, ...override })).toBeNull();
  });

  it("rejects malformed base identifiers and retains no unrequested properties", async () => {
    const builder = getBuilder(await loadQrPayloadModule());
    if (!builder) return;

    expect(builder({ ...VALID_PAYLOAD, cuit: 1234 })).toBeNull();
    expect(builder({ ...VALID_PAYLOAD, nroDocRec: Number.MAX_SAFE_INTEGER + 1 })).toBeNull();
    expect(builder({ ...VALID_PAYLOAD, importe: Number.POSITIVE_INFINITY })).toBeNull();
    expect(builder({ ...VALID_PAYLOAD, moneda: "PES", tipoCodAut: "E", requestDate: "2026-04-09" })).toBeNull();
  });
});
