import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  findGrant: vi.fn(),
  consumeCas: vi.fn(),
  telemetry: vi.fn(),
}));

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

const BINDING = {
  businessId: "tenant-decimal-regression",
  cae: "12345678901234",
  billType: "Factura B",
  afipVoucherType: 6,
  invoiceNumber: 345,
  pointOfSale: 12,
  fiscalAmount: "2750.00",
  issuerCuit: "30712345678",
  recipientIvaCondition: "Consumidor Final",
  recipientDocumentType: null,
  recipientDocumentNumber: null,
};

function grant(overrides: Record<string, unknown> = {}) {
  return {
    id: "grant-decimal-regression",
    ...BINDING,
    fiscalAmount: new Prisma.Decimal("2750.00"),
    requestDate: new Date("2026-04-09T00:00:00.000Z"),
    payload: VALID_PAYLOAD,
    rawQrData: null,
    ...overrides,
  };
}

async function loadConsumer(): Promise<(tx: unknown, token: string, binding: unknown) => Promise<unknown>> {
  const module = await import("@/lib/server/authorized-arca-qr-grant");
  const consumer = (module as unknown as Record<string, unknown>).consumeAuthorizedArcaQrGrant;
  expect(typeof consumer, "consumeAuthorizedArcaQrGrant must remain exported").toBe("function");
  return consumer as (tx: unknown, token: string, binding: unknown) => Promise<unknown>;
}

function mockPersistence() {
  vi.doMock("@/lib/db", () => ({
    db: { authorizedArcaQrGrant: { findFirst: state.findGrant, updateMany: state.consumeCas } },
  }));
  vi.doMock("@/lib/server/qr-telemetry", () => ({ logQrTelemetry: state.telemetry }));
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.findGrant.mockResolvedValue(grant());
  state.consumeCas.mockResolvedValue({ count: 1 });
  mockPersistence();
});

describe("production root cause: normalize grant claims before one-use CAS", () => {
  it("consumes a persisted Prisma Decimal amount and returns its exact canonical claims", async () => {
    const consumer = await loadConsumer();
    const tx = {
      authorizedArcaQrGrant: {
        findFirst: state.findGrant,
        updateMany: state.consumeCas,
      },
    };

    const result = await consumer(tx, "synthetic-opaque-token", BINDING) as {
      id: string;
      claims: { fiscalAmount: string; requestDate: string };
    } | null;

    expect(result).toMatchObject({
      id: "grant-decimal-regression",
      claims: { fiscalAmount: "2750.00", requestDate: "2026-04-09" },
    });
    expect(state.consumeCas).toHaveBeenCalledTimes(1);
    expect(state.telemetry).not.toHaveBeenCalledWith(expect.objectContaining({ reason: "payload-invalid" }));
  });

  it.each([
    ["an invalid request date", { requestDate: "2026-02-30" }],
    ["a Decimal amount that cannot be normalized", { fiscalAmount: new Prisma.Decimal("NaN") }],
  ])("does not consume a grant with %s", async (_label, invalidClaims) => {
    state.findGrant.mockResolvedValue(grant(invalidClaims));
    const consumer = await loadConsumer();
    const tx = {
      authorizedArcaQrGrant: {
        findFirst: state.findGrant,
        updateMany: state.consumeCas,
      },
    };

    await expect(consumer(tx, "synthetic-opaque-token", BINDING)).resolves.toBeNull();

    expect(state.consumeCas).not.toHaveBeenCalled();
  });
});
