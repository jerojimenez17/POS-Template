export interface ArcaQrPayloadV1 {
  ver: 1;
  fecha: string;
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: "PES";
  ctz: 1;
  tipoDocRec: 80 | 96 | 99;
  nroDocRec: number;
  tipoCodAut: "E";
  codAut: number;
}

/** Normalize only visual CUIT separators for ARCA QR data; never for fiscal wire values. */
export function normalizeArcaIssuerCuit(value: unknown): string | null {
  if (typeof value !== "string" || !/^[0-9 .()\-]+$/.test(value)) return null;
  const digits = value.replace(/[ .()\-]/g, "");
  return /^\d{11}$/.test(digits) ? digits : null;
}

const PAYLOAD_KEYS = [
  "ver",
  "fecha",
  "cuit",
  "ptoVta",
  "tipoCmp",
  "nroCmp",
  "importe",
  "moneda",
  "ctz",
  "tipoDocRec",
  "nroDocRec",
  "tipoCodAut",
  "codAut",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isValidPayload(value: unknown): value is ArcaQrPayloadV1 {
  if (!isRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== PAYLOAD_KEYS.length || keys.some((key) => typeof key !== "string" || !PAYLOAD_KEYS.includes(key as typeof PAYLOAD_KEYS[number]))) {
    return false;
  }

  if (value.ver !== 1 || !isCivilDate(value.fecha)
    || typeof value.cuit !== "number" || !/^\d{11}$/.test(String(value.cuit)) || !isPositiveSafeInteger(value.cuit)
    || !isPositiveSafeInteger(value.ptoVta)
    || (value.tipoCmp !== 1 && value.tipoCmp !== 6 && value.tipoCmp !== 11)
    || !isPositiveSafeInteger(value.nroCmp)
    || typeof value.importe !== "number" || !Number.isFinite(value.importe)
    || value.importe <= 0 || value.importe > Number.MAX_SAFE_INTEGER
    || value.moneda !== "PES" || value.ctz !== 1
    || (value.tipoDocRec !== 80 && value.tipoDocRec !== 96 && value.tipoDocRec !== 99)
    || !isNonnegativeSafeInteger(value.nroDocRec)
    || value.tipoCodAut !== "E" || !isPositiveSafeInteger(value.codAut)
    || !/^\d{14}$/.test(String(value.codAut))) {
    return false;
  }

  if (value.tipoDocRec === 99) return value.nroDocRec === 0;
  if (!isPositiveSafeInteger(value.nroDocRec)) return false;
  return value.tipoDocRec !== 80 || /^\d{11}$/.test(String(value.nroDocRec));
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const segmentSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += segmentSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + segmentSize));
  }
  return btoa(binary);
}

/** Returns the fixed ARCA QR URL, or null when the payload is not safe to encode. */
export function buildArcaQrUrl(payload: unknown): string | null {
  if (!isValidPayload(payload)) return null;

  const orderedPayload: ArcaQrPayloadV1 = {
    ver: payload.ver,
    fecha: payload.fecha,
    cuit: payload.cuit,
    ptoVta: payload.ptoVta,
    tipoCmp: payload.tipoCmp,
    nroCmp: payload.nroCmp,
    importe: payload.importe,
    moneda: payload.moneda,
    ctz: payload.ctz,
    tipoDocRec: payload.tipoDocRec,
    nroDocRec: payload.nroDocRec,
    tipoCodAut: payload.tipoCodAut,
    codAut: payload.codAut,
  };
  const url = new URL("https://www.afip.gob.ar/fe/qr/");
  url.searchParams.set("p", encodeBase64Utf8(JSON.stringify(orderedPayload)));
  return url.toString();
}
