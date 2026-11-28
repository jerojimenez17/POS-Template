import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

const VALID_CLAIMS = {
  businessId: "tenant-qr-test-a",
  cae: "12345678901234",
  billType: "Factura B",
  afipVoucherType: 6,
  invoiceNumber: 345,
  pointOfSale: 12,
  fiscalAmount: "2750.00",
  issuerCuit: "30712345678",
  requestDate: "2026-04-09",
  recipientIvaCondition: "Consumidor Final",
  recipientDocumentType: null,
  recipientDocumentNumber: null,
  payload: {
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
  },
  rawQrData: "raw-qr-only-inside-server-grant",
};

async function loadGrantModule(): Promise<Record<string, unknown> | null> {
  try {
    return await vi.importActual<Record<string, unknown>>(
      "@/lib/server/authorized-arca-qr-grant",
    );
  } catch {
    return null;
  }
}

function readFunction(
  module: Record<string, unknown> | null,
  name: string,
): ((...args: never[]) => Promise<unknown>) | null {
  expect(module, "The server-side QR attestation grant module must exist").not.toBeNull();
  const candidate = module?.[name];
  expect(typeof candidate, `${name} must be exported`).toBe("function");
  return typeof candidate === "function"
    ? candidate as (...args: never[]) => Promise<unknown>
    : null;
}

beforeEach(() => {
  vi.resetModules();
  mocks.create.mockReset();
  vi.doMock("@/lib/db", () => ({
    db: {
      authorizedArcaQrGrant: { create: mocks.create },
    },
  }));
});

describe("authorized ARCA QR grant security contract", () => {
  it("returns only an opaque bearer token and stores its SHA-256 hash, not the token", async () => {
    mocks.create.mockResolvedValue({ id: "grant-qr-1" });
    const createGrant = readFunction(await loadGrantModule(), "createAuthorizedArcaQrGrant");
    if (!createGrant) return;

    const result = await createGrant(VALID_CLAIMS as never) as Record<string, unknown>;
    const token = result.token;
    const stored = mocks.create.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
    const storedData = stored?.data;

    expect(Object.keys(result).sort()).toEqual(["id", "token"]);
    expect(result.id).toBe("grant-qr-1");
    expect(typeof token).toBe("string");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain(VALID_CLAIMS.rawQrData);
    expect(JSON.stringify(result)).not.toContain(VALID_CLAIMS.cae);
    expect(storedData?.tokenHash).toBe(createHash("sha256").update(String(token)).digest("hex"));
    expect(storedData).not.toHaveProperty("token");
    expect(storedData?.businessId).toBe(VALID_CLAIMS.businessId);
    expect(storedData?.rawQrData).toBe(VALID_CLAIMS.rawQrData);
    expect(storedData?.expiresAt).toBeInstanceOf(Date);
    expect((storedData?.expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("consumes atomically only once when the complete tenant/CAE/bill binding matches", async () => {
    const consumeGrant = readFunction(await loadGrantModule(), "consumeAuthorizedArcaQrGrant");
    if (!consumeGrant) return;

    const grantRow = { id: "grant-qr-1", ...VALID_CLAIMS, consumedAt: null };
    const tx = {
      authorizedArcaQrGrant: {
        findFirst: vi.fn().mockResolvedValue(grantRow),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const expectedBinding = {
      businessId: VALID_CLAIMS.businessId,
      cae: VALID_CLAIMS.cae,
      billType: VALID_CLAIMS.billType,
      afipVoucherType: VALID_CLAIMS.afipVoucherType,
      invoiceNumber: VALID_CLAIMS.invoiceNumber,
      pointOfSale: VALID_CLAIMS.pointOfSale,
      fiscalAmount: VALID_CLAIMS.fiscalAmount,
      issuerCuit: VALID_CLAIMS.issuerCuit,
      recipientIvaCondition: VALID_CLAIMS.recipientIvaCondition,
      recipientDocumentType: VALID_CLAIMS.recipientDocumentType,
      recipientDocumentNumber: VALID_CLAIMS.recipientDocumentNumber,
    };

    const consumed = await consumeGrant(tx as never, "opaque-token-qr-1" as never, expectedBinding as never);

    expect(consumed).toMatchObject({ id: "grant-qr-1", claims: VALID_CLAIMS });
    expect(tx.authorizedArcaQrGrant.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tokenHash: createHash("sha256").update("opaque-token-qr-1").digest("hex"),
        businessId: expectedBinding.businessId,
        cae: expectedBinding.cae,
        billType: expectedBinding.billType,
        afipVoucherType: VALID_CLAIMS.afipVoucherType,
        invoiceNumber: expectedBinding.invoiceNumber,
        pointOfSale: expectedBinding.pointOfSale,
        fiscalAmount: expectedBinding.fiscalAmount,
        issuerCuit: expectedBinding.issuerCuit,
        recipientIvaCondition: expectedBinding.recipientIvaCondition,
        recipientDocumentType: expectedBinding.recipientDocumentType,
        recipientDocumentNumber: expectedBinding.recipientDocumentNumber,
        consumedAt: null,
        expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
      }),
    }));
    expect(tx.authorizedArcaQrGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: grantRow.id, consumedAt: null }),
    }));
  });

  it.each([
    ["missing token", ""],
    ["malformed token", "not-an-opaque-token"],
  ])("rejects a %s without making a grant available", async (_label, token) => {
    const consumeGrant = readFunction(await loadGrantModule(), "consumeAuthorizedArcaQrGrant");
    if (!consumeGrant) return;

    const tx = {
      authorizedArcaQrGrant: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    await expect(consumeGrant(tx as never, token as never, {
      businessId: VALID_CLAIMS.businessId,
      cae: VALID_CLAIMS.cae,
    } as never)).resolves.toBeNull();
  });

  it("treats a compare-and-set loser as replay and never returns its claims", async () => {
    const consumeGrant = readFunction(await loadGrantModule(), "consumeAuthorizedArcaQrGrant");
    if (!consumeGrant) return;

    const tx = {
      authorizedArcaQrGrant: {
        findFirst: vi.fn().mockResolvedValue({ id: "grant-qr-1", ...VALID_CLAIMS, consumedAt: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    await expect(consumeGrant(tx as never, "replayed-token" as never, {
      businessId: VALID_CLAIMS.businessId,
      cae: VALID_CLAIMS.cae,
    } as never)).resolves.toBeNull();
    expect(tx.authorizedArcaQrGrant.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["CAE", { cae: "99999999999999" }],
    ["business/tenant", { businessId: "tenant-qr-test-other" }],
    ["bill type", { billType: "Factura A" }],
    ["POS", { pointOfSale: 13 }],
    ["invoice number", { invoiceNumber: 346 }],
    ["fiscal amount", { fiscalAmount: "2750.01" }],
    ["issuer CUIT", { issuerCuit: "30111111119" }],
    ["recipient", { recipientIvaCondition: "Responsable Inscripto" }],
    ["recipient document", { recipientDocumentNumber: "20123456789" }],
  ])("does not consume a grant when only the %s binding differs", async (_label, mismatch) => {
    const consumeGrant = readFunction(await loadGrantModule(), "consumeAuthorizedArcaQrGrant");
    if (!consumeGrant) return;

    const token = "one-token-per-binding-check";
    const grantRow = {
      id: "grant-qr-binding-matrix",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      ...VALID_CLAIMS,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const matches = (where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => {
      if (key === "expiresAt") return grantRow.expiresAt > (value as { gt: Date }).gt;
      return grantRow[key as keyof typeof grantRow] === value;
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      authorizedArcaQrGrant: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
          matches(where) ? grantRow : null),
        updateMany,
      },
    };
    const expectedBinding = {
      businessId: VALID_CLAIMS.businessId,
      cae: VALID_CLAIMS.cae,
      billType: VALID_CLAIMS.billType,
      afipVoucherType: VALID_CLAIMS.afipVoucherType,
      invoiceNumber: VALID_CLAIMS.invoiceNumber,
      pointOfSale: VALID_CLAIMS.pointOfSale,
      fiscalAmount: VALID_CLAIMS.fiscalAmount,
      issuerCuit: VALID_CLAIMS.issuerCuit,
      recipientIvaCondition: VALID_CLAIMS.recipientIvaCondition,
      recipientDocumentType: VALID_CLAIMS.recipientDocumentType,
      recipientDocumentNumber: VALID_CLAIMS.recipientDocumentNumber,
      ...mismatch,
    };

    await expect(consumeGrant(tx as never, token as never, expectedBinding as never)).resolves.toBeNull();
    expect(tx.authorizedArcaQrGrant.findFirst).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("allows exactly one of two concurrent consumers of the same token to win CAS", async () => {
    const consumeGrant = readFunction(await loadGrantModule(), "consumeAuthorizedArcaQrGrant");
    if (!consumeGrant) return;

    const grantRow = { id: "grant-qr-concurrent", ...VALID_CLAIMS, consumedAt: null as Date | null };
    let readers = 0;
    let winners = 0;
    let releaseReaders!: () => void;
    const bothReadersArrived = new Promise<void>((resolve) => { releaseReaders = resolve; });
    const updateMany = vi.fn(async ({ where }: { where: { id: string; consumedAt: null } }) => {
      if (where.id !== grantRow.id || grantRow.consumedAt !== null) return { count: 0 };
      grantRow.consumedAt = new Date();
      winners += 1;
      return { count: 1 };
    });
    const tx = {
      authorizedArcaQrGrant: {
        findFirst: vi.fn(async () => {
          readers += 1;
          if (readers === 2) releaseReaders();
          await bothReadersArrived;
          return grantRow;
        }),
        updateMany,
      },
    };
    const binding = {
      businessId: VALID_CLAIMS.businessId,
      cae: VALID_CLAIMS.cae,
      billType: VALID_CLAIMS.billType,
      afipVoucherType: VALID_CLAIMS.afipVoucherType,
      invoiceNumber: VALID_CLAIMS.invoiceNumber,
      pointOfSale: VALID_CLAIMS.pointOfSale,
      fiscalAmount: VALID_CLAIMS.fiscalAmount,
      issuerCuit: VALID_CLAIMS.issuerCuit,
      recipientIvaCondition: VALID_CLAIMS.recipientIvaCondition,
      recipientDocumentType: VALID_CLAIMS.recipientDocumentType,
      recipientDocumentNumber: VALID_CLAIMS.recipientDocumentNumber,
    };

    const results = await Promise.all([
      consumeGrant(tx as never, "same-concurrent-token" as never, binding as never),
      consumeGrant(tx as never, "same-concurrent-token" as never, binding as never),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(winners).toBe(1);
  });
});
