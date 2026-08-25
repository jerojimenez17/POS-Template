import type CAE from "@/models/CAE";

export const parseCAE = (value: unknown): CAE | undefined => {
  if (!value) return undefined;
  if (typeof value === "object" && value !== null) {
    const candidate = value as Partial<CAE>;
    if (typeof candidate.CAE !== "string") return undefined;
    return {
      CAE: candidate.CAE,
      vencimiento: typeof candidate.vencimiento === "string" ? candidate.vencimiento : "",
      nroComprobante: candidate.nroComprobante ?? 0,
      qrData: typeof candidate.qrData === "string" ? candidate.qrData : "",
      ...(candidate.ptoVenta !== undefined ? { ptoVenta: candidate.ptoVenta } : {}),
    };
  }
  return undefined;
};
