import type CAE from "@/models/CAE";

export const parseCAE = (value: unknown): CAE | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") {
    const rawCae = value.trim();
    if (/^\d{14}$/.test(rawCae)) {
      return { CAE: rawCae, vencimiento: "", nroComprobante: 0, qrData: "" };
    }
    try { return parseCAE(JSON.parse(value) as unknown); } catch { return undefined; }
  }
  if (typeof value === "object" && value !== null) {
    const candidate = value as Partial<CAE> & { cae?: unknown };
    const caeCandidates = [candidate.CAE, candidate.cae].filter((cae): cae is string => typeof cae === "string");
    const caeValue = caeCandidates.find((cae) => /^\d{14}$/.test(cae.trim()));
    if (!caeValue) return undefined;
    return {
      CAE: caeValue.trim(),
      vencimiento: typeof candidate.vencimiento === "string" ? candidate.vencimiento : "",
      nroComprobante: candidate.nroComprobante ?? 0,
      qrData: typeof candidate.qrData === "string" ? candidate.qrData : "",
      ...(candidate.ptoVenta !== undefined ? { ptoVenta: candidate.ptoVenta } : {}),
    };
  }
  return undefined;
};
