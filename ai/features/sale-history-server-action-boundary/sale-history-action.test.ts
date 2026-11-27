import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, findManyMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { orderUpdate: { findMany: findManyMock } } }));

interface HistoryAction {
  getSaleHistoryAction: (orderId: string) => Promise<unknown[]>;
}

const actionFile = resolve(process.cwd(), "src/actions/sales/get-sale-history.ts");

async function loadAction(): Promise<HistoryAction | null> {
  expect(existsSync(actionFile)).toBe(true);
  if (!existsSync(actionFile)) return null;
  const moduleUrl = pathToFileURL(actionFile).href;
  return (await import(/* @vite-ignore */ moduleUrl)) as unknown as HistoryAction;
}

describe("sale history server action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { businessId: "business-a" } });
    findManyMock.mockResolvedValue([]);
  });

  it("has one explicit use-server boundary and exports the existing action contract", () => {
    const source = existsSync(actionFile) ? readFileSync(actionFile, "utf8") : "";
    expect(source.match(/^[ \t]*[\"']use server[\"'];?/m)).not.toBeNull();
    expect(source.match(/^[ \t]*[\"']use server[\"'];?/gm)).toHaveLength(1);
    expect(source).toMatch(/export\s+(?:async\s+)?function\s+getSaleHistoryAction|export\s+const\s+getSaleHistoryAction/);
  });

  it("rejects invalid ids and missing business context without querying", async () => {
    const action = await loadAction();
    if (!action) return;

    await expect(action.getSaleHistoryAction(" ")).rejects.toThrow(/inválido|requerido|autorizado/i);
    expect(findManyMock).not.toHaveBeenCalled();

    authMock.mockResolvedValueOnce(null);
    await expect(action.getSaleHistoryAction("sale-1")).rejects.toThrow(/no autorizado/i);
    expect(findManyMock).not.toHaveBeenCalled();

    authMock.mockResolvedValueOnce({ user: {} });
    await expect(action.getSaleHistoryAction("sale-1")).rejects.toThrow(/no autorizado/i);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("scopes by business, selects only updater identity, orders newest first, and preserves the array", async () => {
    const updates = [{ id: "new" }, { id: "old" }];
    findManyMock.mockResolvedValueOnce(updates);
    const action = await loadAction();
    if (!action) return;

    await expect(action.getSaleHistoryAction("sale-1")).resolves.toBe(updates);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { orderId: "sale-1", order: { businessId: "business-a" } },
      include: { updatedBy: { select: { name: true, email: true } } },
      orderBy: { date: "desc" },
    });
  });

  it("logs database failures but rejects with a sanitized error", async () => {
    const databaseSecret = "PrismaClientKnownRequestError: secret table details";
    findManyMock.mockRejectedValue(new Error(databaseSecret));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const action = await loadAction();
    if (!action) return;

    await expect(action.getSaleHistoryAction("sale-1")).rejects.toThrow();
    await expect(action.getSaleHistoryAction("sale-1")).rejects.not.toThrow(databaseSecret);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
