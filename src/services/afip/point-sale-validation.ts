import BillTypes, { type BillType } from "@/models/billType";

export type AfipVoucherType = 1 | 6 | 11;
export type AfipOperation = "getLastVoucher" | "createVoucher";
export type AfipEnvironment = "homologacion" | "produccion" | "desconocido";

export interface AfipPointSaleRequest {
  ptoVenta: number;
  tipoFactura: AfipVoucherType;
}

export interface AfipPointSaleError {
  code: string;
  message: string;
  operation: AfipOperation;
  ptoVenta: number;
  tipoFactura: AfipVoucherType;
  environment?: AfipEnvironment;
}

export interface AfipPointSaleValidation extends AfipPointSaleRequest {
  valid: boolean;
  lastVoucherNumber?: number;
  error?: AfipPointSaleError;
}

export function getAfipVoucherTypeCode(value: string): AfipVoucherType {
  if (value === BillTypes.A) return 1;
  if (value === BillTypes.B) return 6;
  if (value === BillTypes.C) return 11;
  throw new Error("Tipo de comprobante AFIP inválido");
}

export function validatePointSaleRequest(
  request: AfipPointSaleRequest,
  configuredPoints: readonly number[],
): AfipPointSaleRequest {
  if (!Number.isInteger(request.ptoVenta) || request.ptoVenta <= 0) {
    throw new Error("El punto de venta debe ser un entero positivo");
  }
  if (![1, 6, 11].includes(request.tipoFactura)) {
    throw new Error("El tipo de comprobante AFIP es inválido");
  }
  if (!configuredPoints.includes(request.ptoVenta)) {
    throw new Error("El punto de venta no está configurado");
  }
  return request;
}

export function formatAfipPointSaleErrorForUser(error: AfipPointSaleError): string {
  const type = error.tipoFactura === 1 ? "Factura A" : error.tipoFactura === 6 ? "Factura B" : "Factura C";
  const safeMessage = sanitizeAfipText(error.message);
  if (error.code === "11002") {
    const environment = error.environment && error.environment !== "desconocido" ? error.environment : "ambiente desconocido";
    return `AFIP/ARCA rechazó el punto de venta ${String(error.ptoVenta).padStart(3, "0")} para ${type} (tipo ${error.tipoFactura}) en el WebService de este CUIT y ${environment} (código 11002). Verifique en ARCA que esté habilitado para WSFE/WSFEv1, que corresponda al CUIT y al ambiente del certificado. Actualice la configuración o seleccione otro punto habilitado. No se generó CAE. Detalle: ${safeMessage}`;
  }
  return `No se pudo operar AFIP para el punto ${error.ptoVenta}, ${type}: ${safeMessage}`;
}

export function billTypeFromCode(code: AfipVoucherType): BillType {
  return code === 1 ? BillTypes.A : code === 6 ? BillTypes.B : BillTypes.C;
}

export interface AfipPointSaleErrorContext {
  operation: AfipOperation;
  ptoVenta: number;
  tipoFactura: AfipVoucherType;
  environment?: AfipEnvironment;
}

const SENSITIVE_KEY = /^(?:cert|key|token|secret|password|authorization|api[_ -]?key|accessToken|encryptedCert|encryptedKey|qr|qrData|cae|cuit)$/i;
const SENSITIVE_ASSIGNMENT = /(?:cert(?:ificate)?|key|token|secret|password|authorization|api[_ -]?key|accessToken|encryptedCert|encryptedKey|qr(?:Data)?|cae|cuit)\s*[=:]\s*[^\s,;)}\]]+/gi;

/** Returns a bounded, user-safe fragment; it never serializes an AFIP payload. */
export function sanitizeAfipText(value: string, limit = 300): string {
  return value
    .replace(SENSITIVE_ASSIGNMENT, "[redacted]")
    .replace(/\b\d{14}\b/g, "[redacted]")
    .replace(/\b\d{11}\b/g, "[redacted]")
    .replace(/PRIVATE[_ -]?(?:CERT|KEY)|SECRET|SECRET[_ -]?TOKEN/gi, "[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, limit);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const collectAfipText = (payload: unknown): { code?: string; text: string } => {
  const fragments: string[] = [];
  let detectedCode: string | undefined;
  const visited = new Set<object>();
  const visit = (value: unknown, key = "", depth = 0): void => {
    if (depth > 5 || fragments.length >= 8) return;
    if (typeof value === "string") {
      const match = value.match(/\b(11002|HTTP\s*\d{3})\b/i);
      if (!detectedCode && match) detectedCode = match[1].toUpperCase().replace(/\s+/g, "_");
      if (/^(code|message|error|detail|description|reason|statusText|details?)$/i.test(key)) fragments.push(value);
      return;
    }
    if (typeof value === "number" && /^(code|status)$/i.test(key)) {
      const numericCode = String(value);
      if (!detectedCode && numericCode === "11002") detectedCode = numericCode;
      return;
    }
    if (value instanceof Error) {
      visit(value.message, "message", depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    if (visited.has(value)) return;
    visited.add(value);
    for (const [childKey, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(childKey)) continue;
      visit(child, childKey, depth + 1);
    }
  };
  visit(payload);
  return { code: detectedCode, text: fragments.map((item) => sanitizeAfipText(item, 120)).filter(Boolean).join(" ").slice(0, 300) };
};

export function parseAfipPointSaleError(payload: unknown, context: AfipPointSaleErrorContext): AfipPointSaleError {
  const { code = "AFIP_ERROR", text } = collectAfipText(payload);
  const message = text || (code === "11002" ? "AFIP rechazó el punto de venta (código 11002)" : "AFIP rechazó la operación");
  return { ...context, code, message };
}
