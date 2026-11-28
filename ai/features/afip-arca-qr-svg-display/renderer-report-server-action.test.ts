import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolveDto: vi.fn() }));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/server/authorized-arca-qr-grant", () => ({
  resolveOrderQrPrintDto: mocks.resolveDto,
}));

type Renderer = "pdf" | "thermal-html" | "qz" | "partial";
type Outcome = "generated" | "failed" | "submitted";
type ReportAction = (input: unknown) => Promise<unknown>;

async function loadReportAction(): Promise<ReportAction> {
  // Keep the test compilable before the Server Action export is implemented.
  const actions = await import("@/actions/sales/qr-print") as unknown as Record<string, unknown>;
  const action = actions.reportQrRendererOutcomeAction;
  expect(action, "expected reportQrRendererOutcomeAction export from qr-print Server Actions").toBeTypeOf("function");
  return action as ReportAction;
}

function capturedLogs(spy: ReturnType<typeof vi.spyOn>): string {
  return JSON.stringify(spy.mock.calls);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "synthetic-authenticated-user", businessId: "synthetic-tenant" } });
  mocks.resolveDto.mockResolvedValue({ qrValue: null, qrKind: "none" });
});

describe("authenticated QR renderer outcome Server Action", () => {
  it.each([
    ["pdf", "generated"], ["pdf", "failed"], ["pdf", "submitted"],
    ["thermal-html", "generated"], ["thermal-html", "failed"], ["thermal-html", "submitted"],
    ["qz", "generated"], ["qz", "failed"], ["qz", "submitted"],
    ["partial", "generated"], ["partial", "failed"], ["partial", "submitted"],
  ] as const)("accepts allowlisted report %s/%s and logs only fixed enums", async (renderer, outcome) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const report = await loadReportAction();
      const result = await report({ renderer, outcome });

      expect(result).toEqual({ success: true });
      expect(JSON.stringify(result)).not.toMatch(/qrKind|reason|diagnostic|error|renderer|outcome/i);
      expect(info).toHaveBeenCalledTimes(1);
      const event = info.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(event).toEqual({ stage: "render", renderer, outcome });
      expect(Object.keys(event).sort()).toEqual(["outcome", "renderer", "stage"]);
    } finally {
      info.mockRestore();
    }
  });

  it("rejects unauthenticated calls without emitting report telemetry", async () => {
    mocks.auth.mockResolvedValue(null);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const report = await loadReportAction();
      const result = await report({ renderer: "pdf", outcome: "generated" });

      expect(result).toEqual({ success: false });
      expect(JSON.stringify(result)).not.toMatch(/reason|diagnostic|unauthorized|synthetic-authenticated-user/i);
      expect(info).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });

  it.each([
    { renderer: "server", outcome: "generated" },
    { renderer: "pdf", outcome: "ready" },
    { renderer: 12, outcome: "generated" },
    { renderer: "pdf", outcome: null },
    { renderer: "x".repeat(100_000), outcome: "generated" },
    { renderer: "pdf", outcome: "generated", orderId: "ORDER-PRIVATE-SENTINEL" },
    { renderer: "pdf", outcome: "generated", qrValue: "https://private.invalid/raw?secret=1" },
    { renderer: "partial", outcome: "generated", cae: "CAE-PRIVATE-SENTINEL", cuit: "CUIT-PRIVATE-SENTINEL", token: "TOKEN-PRIVATE-SENTINEL" },
  ])("rejects malformed, unbounded, or extra-field input without logging submitted data", async (input) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const report = await loadReportAction();
      const result = await report(input);

      expect(result).toEqual({ success: false });
      expect(JSON.stringify(result)).not.toMatch(/reason|diagnostic|ORDER-PRIVATE|CAE-PRIVATE|CUIT-PRIVATE|TOKEN-PRIVATE|private\.invalid/i);
      expect(info).not.toHaveBeenCalled();
      expect(capturedLogs(info)).not.toMatch(/ORDER-PRIVATE|CAE-PRIVATE|CUIT-PRIVATE|TOKEN-PRIVATE|private\.invalid/);
    } finally {
      info.mockRestore();
    }
  });
});
