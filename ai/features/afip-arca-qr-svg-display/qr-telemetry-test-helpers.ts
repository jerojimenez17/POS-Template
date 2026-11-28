import { expect, vi } from "vitest";

const ALLOWED_STAGES = new Set(["grant-create", "save-consume-ref", "resolve", "render"]);
const ALLOWED_REASONS = new Set([
  "claims-invalid",
  "grant-create-failed",
  "token-absent",
  "binding-mismatch",
  "grant-expired/replayed",
  "policy-v1-no-ref",
  "grant-row-missing",
  "issuer-mismatch",
  "invoice-binding-mismatch",
  "payload-invalid",
  "renderer-failed",
  "QR-ready",
]);
const ALLOWED_QR_KINDS = new Set(["verified-url", "verified-raw", "legacy-raw", "none"]);
const ALLOWED_RENDERERS = new Set(["pdf", "thermal-html", "qz", "partial"]);
const ALLOWED_EVENT_FIELDS = new Set(["stage", "outcome", "reason", "qrKind", "renderer"]);
const FORBIDDEN_FIELD = /^(?:orderId|businessId|tenantId|cae|issuerCuit|cuit|recipientDocumentNumber|recipientNumber|token|qrAttestationToken|qrData|rawQrData|qrUrl|qrValue|url|payload|requestDate|amount|fiscalAmount|total|json|base64)$/i;

const CONSOLE_METHODS = ["debug", "info", "log", "warn", "error"] as const;

export function captureConsoleCalls() {
  const calls: unknown[][] = [];
  const restore: Array<() => void> = [];

  for (const method of CONSOLE_METHODS) {
    const spy = vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      calls.push(args);
    });
    restore.push(() => spy.mockRestore());
  }

  return {
    calls,
    restore: () => restore.forEach((restoreSpy) => restoreSpy()),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectNoSensitiveLogShape(value: unknown): void {
  if (value instanceof Error) {
    expect(value.message).toBe("");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(expectNoSensitiveLogShape);
    return;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      expect(FORBIDDEN_FIELD.test(key)).toBe(false);
      expectNoSensitiveLogShape(nested);
    }
    return;
  }
  if (typeof value === "string") {
    expect(value).not.toMatch(/https?:\/\/|data:[^\s"']+|base64,|^[A-Za-z0-9+/]{32,}={0,2}$/i);
    if (/^\s*[\[{]/.test(value)) {
      expect(() => JSON.parse(value)).toThrow();
    }
  }
}

export function expectSafeQrTelemetry(
  calls: unknown[][],
  expected: Record<string, unknown>,
  sentinels: string[] = [],
): void {
  const entries = calls.flatMap((args) => args.filter(isRecord));
  const telemetry = entries.filter((entry) => typeof entry.stage === "string");

  expect(entries.every((entry) => typeof entry.stage === "string")).toBe(true);
  expect(telemetry, "expected a structured server-side QR telemetry event").toEqual(
    expect.arrayContaining([expect.objectContaining(expected)]),
  );

  for (const entry of telemetry) {
    expect(Object.keys(entry).every((key) => ALLOWED_EVENT_FIELDS.has(key))).toBe(true);
    expect(ALLOWED_STAGES.has(String(entry.stage))).toBe(true);
    if (entry.reason !== undefined) expect(ALLOWED_REASONS.has(String(entry.reason))).toBe(true);
    if (entry.qrKind !== undefined) expect(ALLOWED_QR_KINDS.has(String(entry.qrKind))).toBe(true);
    if (entry.renderer !== undefined) expect(ALLOWED_RENDERERS.has(String(entry.renderer))).toBe(true);
    if (entry.qrKind === "none") expect(ALLOWED_REASONS.has(String(entry.reason))).toBe(true);
    if (entry.qrKind !== undefined && entry.qrKind !== "none") {
      expect(entry.reason === undefined || entry.reason === "QR-ready").toBe(true);
    }
    for (const [key, value] of Object.entries(entry)) {
      expect(FORBIDDEN_FIELD.test(key)).toBe(false);
      expect(typeof value).toBe("string");
      if (key === "reason") {
        expect(ALLOWED_REASONS.has(String(value))).toBe(true);
      } else {
        expect(String(value)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+|\/[a-z0-9]+)*$/i);
      }
    }
  }

  const serializedLogs = JSON.stringify(calls);
  expectNoSensitiveLogShape(calls);
  for (const sentinel of sentinels) expect(serializedLogs).not.toContain(sentinel);
  expect(serializedLogs).not.toMatch(/https?:\/\/|data:[^\s"']+|base64,/i);
}

export function expectNoBrowserQrDiagnostics(calls: unknown[][], sentinels: string[] = []): void {
  const structuredEntries = calls.flatMap((args) => args.filter(isRecord));
  expect(structuredEntries.some((entry) => "stage" in entry)).toBe(false);
  expectNoSensitiveLogShape(calls);
  const serializedCalls = JSON.stringify(calls);
  for (const sentinel of sentinels) expect(serializedCalls).not.toContain(sentinel);
  expect(serializedCalls).not.toMatch(/https?:\/\/|data:[^\s"']+|base64,/i);
}
