import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { authMock, orderFindManyMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  orderFindManyMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { order: { findMany: orderFindManyMock } } }));
// Esta rama protege el ledger con la feature hasClientLedger; el test aísla
// únicamente el límite de error del datasource de Prisma.
vi.mock("@/lib/auth-gates", () => ({
  requireFeature: vi.fn().mockResolvedValue({ success: true, data: {} }),
}));

import { getUnpaidOrders } from "@/actions/unpaid-orders";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readRepoFile = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

interface PackageManifest {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface PackageLock {
  packages: Record<string, {
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>;
}

const exactVersion = (value: string | undefined): boolean =>
  typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);

const input = {
  businessId: "business-from-request",
  status: "inpago",
  limit: 25,
};

describe("getUnpaidOrders datasource failure boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { businessId: "business-from-session" } });
  });

  it("keeps P6001 observable instead of returning an empty successful ledger", async () => {
    const error = Object.assign(
      new Error("synthetic Prisma datasource validation failure"),
      { code: "P6001" },
    );
    orderFindManyMock.mockRejectedValue(error);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await getUnpaidOrders(input);

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBe("Error al obtener las órdenes (P6001)");
      expect(orderFindManyMock).toHaveBeenCalledTimes(1);
    } finally {
      errorLog.mockRestore();
    }
  });

  it("does not expose a synthetic datasource URL in the returned error", async () => {
    // Fixture is fictitious and the mocked query never contacts a service.
    const syntheticUrl = "postgresql://fixture-user:fixture-password@fixture.invalid:5432/fixture-db";
    orderFindManyMock.mockRejectedValue(
      Object.assign(new Error(`P6001: datasource rejected ${syntheticUrl}`), { code: "P6001" }),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await getUnpaidOrders(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Error al obtener las órdenes (P6001)");
      expect(result.error).not.toContain(syntheticUrl);
    } finally {
      errorLog.mockRestore();
    }
  });

  it("logs the P6001 code without logging the error text or datasource URL", async () => {
    // Fixture is fictitious and the mocked query never contacts a service.
    const syntheticUrl = "postgresql://fixture-user:fixture-password@fixture.invalid:5432/fixture-db";
    const syntheticErrorText = `P6001: datasource rejected ${syntheticUrl}`;
    orderFindManyMock.mockRejectedValue(
      Object.assign(new Error(syntheticErrorText), { code: "P6001" }),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await getUnpaidOrders(input);
      const loggerArguments = JSON.stringify(errorLog.mock.calls);

      expect(errorLog).toHaveBeenCalledWith("Error getting unpaid orders:", {
        errorType: "Error",
        code: "P6001",
      });
      expect(loggerArguments).not.toContain(syntheticErrorText);
      expect(loggerArguments).not.toContain(syntheticUrl);
    } finally {
      errorLog.mockRestore();
    }
  });
});

describe("versioned Prisma datasource configuration", () => {
  it("pins Prisma CLI and client to the same exact version in manifest and lockfile", () => {
    const manifest = JSON.parse(readRepoFile("package.json")) as PackageManifest;
    const lock = JSON.parse(readRepoFile("package-lock.json")) as PackageLock;
    const clientManifestVersion = manifest.dependencies["@prisma/client"];
    const cliManifestVersion = manifest.devDependencies.prisma;
    const clientLockVersion = lock.packages["node_modules/@prisma/client"]?.version;
    const cliLockVersion = lock.packages["node_modules/prisma"]?.version;

    expect(exactVersion(clientManifestVersion)).toBe(true);
    expect(exactVersion(cliManifestVersion)).toBe(true);
    expect(clientManifestVersion).toBe(cliManifestVersion);
    expect(clientLockVersion).toBe(clientManifestVersion);
    expect(cliLockVersion).toBe(cliManifestVersion);
    expect(lock.packages[""]?.dependencies?.["@prisma/client"]).toBe(clientManifestVersion);
    expect(lock.packages[""]?.devDependencies?.prisma).toBe(cliManifestVersion);
  });

  it("declares direct PostgreSQL with DATABASE_URL as the primary datasource", () => {
    const schema = readRepoFile("prisma/schema.prisma");
    const datasource = schema.match(/datasource\s+db\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(datasource).toMatch(/provider\s*=\s*"postgresql"/);
    expect(datasource).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
    expect(datasource).toMatch(/directUrl\s*=\s*env\("DATABASE_URL_UNPOOLED"\)/);
    expect(datasource).not.toMatch(/accelerate|prisma\+postgres/i);
  });

  it("uses the standard PrismaClient singleton without Accelerate or adapter configuration", () => {
    const dbSource = readRepoFile("src/lib/db.ts");

    expect(dbSource).toMatch(/import\s+\{\s*PrismaClient\s*\}\s+from\s+"@prisma\/client"/);
    expect(dbSource).toMatch(/new\s+PrismaClient\s*\(\s*\)/);
    expect(dbSource).not.toMatch(/accelerate|withAccelerate|accelerateUrl|adapter/i);
    expect(dbSource).not.toMatch(/DATABASE_URL(?:_UNPOOLED)?/);
  });
});
