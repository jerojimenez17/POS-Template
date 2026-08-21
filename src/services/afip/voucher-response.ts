import type {
  AfipEnvironment,
  AfipPointSaleError,
  AfipVoucherType,
} from "./point-sale-validation";
import { parseAfipPointSaleError } from "./point-sale-validation";

export type AfipResponsePath = "direct" | "afip" | "data" | "data.afip";

export interface AfipVoucherSuccessData {
  cae: string;
  vencimiento: string;
  nroComprobante: number | string;
  qrData: string;
  ptoVenta?: number | string;
  sourcePath: AfipResponsePath;
}

export interface AfipResponseShape {
  status?: number;
  routes: string[];
  fields: Record<string, string>;
  candidatePath?: string;
  candidateValid?: boolean;
}

export interface AfipResponseDiagnostic extends AfipResponseShape {
  reason: "missing-cae" | "afip-error";
}

export type AfipVoucherParsed =
  | { kind: "success"; data: AfipVoucherSuccessData }
  | { kind: "afip-error"; message: string; code?: string; responseShape: AfipResponseShape; error: AfipPointSaleError }
  | { kind: "missing-cae"; message: string; responseShape: AfipResponseShape };

interface ParseContext {
  ptoVenta: number;
  tipoFactura: AfipVoucherType;
  environment?: AfipEnvironment;
  status?: number;
}

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fieldType = (value: unknown): string => {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
};

const summarizeError = (value: unknown): string => {
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) return value.map(summarizeError).filter(Boolean).join(" ").slice(0, 500);
  if (isRecord(value)) {
    return ["code", "message", "error", "detail", "description"]
      .map((key) => value[key])
      .filter((item) => item !== undefined)
      .map(summarizeError)
      .filter(Boolean)
      .join(" ")
      .slice(0, 500);
  }
  return "";
};

const containsAfipFailureMarker = (value: unknown, depth = 0, visited = new Set<object>()): boolean => {
  if (depth > 5) return false;
  if (typeof value === "string") return /\b11002\b|rechaz|error|rejected/i.test(value);
  if (!isRecord(value) && !Array.isArray(value)) return false;
  if (typeof value === "object") {
    if (visited.has(value)) return false;
    visited.add(value);
  }
  return Object.values(value).some((child) => containsAfipFailureMarker(child, depth + 1, visited));
};

const validCae = (value: unknown): value is string =>
  typeof value === "string" && /^\d{14}$/.test(value.trim());

const first = (...values: unknown[]): unknown => values.find((value) => value !== undefined);

/** Parses only the AFIP response paths documented by the createVoucher contract. */
export function parseAfipVoucherResponse(payload: unknown, context: ParseContext): AfipVoucherParsed {
  const root = isRecord(payload) ? payload : {};
  const wrapper = root.success === true && isRecord(root.data) ? root.data : root;
  const base = root.success === true && isRecord(root.data) ? root.data : root;
  const candidates: Array<{ path: AfipResponsePath; value: RecordValue | undefined }> = [
    { path: root.success === true ? "data" : "direct", value: root.success === true ? base : base },
    { path: root.success === true ? "data.afip" : "afip", value: isRecord(base.afip) ? base.afip : undefined },
    { path: "data", value: isRecord(base.data) ? base.data : undefined },
    { path: "data.afip", value: isRecord(base.data) && isRecord(base.data.afip) ? base.data.afip : undefined },
  ];

  const routes = [
    ...(isRecord(root.data) ? ["data"] : []),
    ...(isRecord(root.afip) ? ["afip"] : []),
    ...(isRecord(root.data) && isRecord(root.data.afip) ? ["data.afip"] : []),
  ];
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(root)) fields[key] = fieldType(value);
  if (isRecord(root.data)) for (const [key, value] of Object.entries(root.data)) fields[`data.${key}`] = fieldType(value);

  const responseShape: AfipResponseShape = { status: context.status, routes, fields };
  const candidate = candidates.find(({ value }) => value !== undefined && "CAE" in value);
  if (candidate) {
    responseShape.candidatePath = candidate.path;
    const caeCandidate = candidate.value?.CAE;
    responseShape.candidateValid = validCae(caeCandidate);
    if (validCae(caeCandidate)) {
      const value = candidate.value;
      if (!value) return { kind: "missing-cae", message: "La Cloud Function respondió sin un CAE válido. Revise la configuración y los logs del servidor.", responseShape };
      return {
        kind: "success",
        data: {
          cae: caeCandidate.trim(),
          vencimiento: String(first(value.CAEFchVto, wrapper.CAEFchVto, root.CAEFchVto) ?? ""),
          nroComprobante: (first(value.nroCbte, value.nroComprobante, wrapper.nroCbte, root.nroCbte) ?? 0) as number | string,
          qrData: String(first(value.qrData, wrapper.qrData, root.qrData) ?? ""),
          ptoVenta: first(value.ptoVenta, wrapper.ptoVenta, root.ptoVenta, context.ptoVenta) as number | string,
          sourcePath: candidate.path,
        },
      };
    }
  }

  const errorPayload = root.success === false ? first(root.error, root.errors, root.message) : first(
    isRecord(wrapper.afip) ? wrapper.afip.error : undefined,
    isRecord(wrapper.afip) ? wrapper.afip.errors : undefined,
    isRecord(wrapper.data) && isRecord(wrapper.data.afip) ? wrapper.data.afip.errors : undefined,
    root.error,
    root.errors,
    root.message,
  );
  const errorText = summarizeError(errorPayload);
  if (errorPayload !== undefined || context.status !== undefined && context.status >= 400 || containsAfipFailureMarker(payload)) {
    const error = parseAfipPointSaleError(errorText || "AFIP rechazó la operación", {
      operation: "createVoucher", ptoVenta: context.ptoVenta, tipoFactura: context.tipoFactura, environment: context.environment,
    });
    return { kind: "afip-error", message: error.message, code: error.code, responseShape, error };
  }
  return { kind: "missing-cae", message: "La Cloud Function respondió sin un CAE válido. Revise la configuración y los logs del servidor.", responseShape };
}

export const isValidCae = validCae;
