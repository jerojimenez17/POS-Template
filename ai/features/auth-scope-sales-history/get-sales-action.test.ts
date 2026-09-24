import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, findManyMock, mapperMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findManyMock: vi.fn(),
  mapperMock: vi.fn((order: { id: string }) => ({ id: order.id })),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { order: { findMany: findManyMock } } }));
vi.mock("@/actions/sales/history", () => ({ mapOrderToBillState: mapperMock }));

interface SalesAction {
  getSalesAction: (params?: { cursor?: string; take?: number }) => Promise<{
    sales: Array<{ id: string }>;
    nextCursor: string | null;
  }>;
}

const actionFile = resolve(process.cwd(), "src/actions/sales/get-sales.ts");

async function loadAction(): Promise<SalesAction | null> {
  expect(existsSync(actionFile)).toBe(true);
  if (!existsSync(actionFile)) return null;
  return (await import(/* @vite-ignore */ pathToFileURL(actionFile).href)) as unknown as SalesAction;
}

describe("getSalesAction authorization and query contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { businessId: "business-a" } });
    findManyMock.mockResolvedValue([]);
  });

  it.each([
    [null],
    [{ user: {} }],
    [{ user: { businessId: "" } }],
  ])("returns a safe empty result without querying when session is %j", async (session) => {
    authMock.mockResolvedValueOnce(session);
    const action = await loadAction();
    if (!action) return;

    await expect(action.getSalesAction()).resolves.toEqual({ sales: [], nextCursor: null });
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("authenticates on every invocation and scopes paid orders to session businessId", async () => {
    const orders = [{ id: "sale-a" }, { id: "sale-b" }];
    findManyMock.mockResolvedValueOnce(orders);
    const action = await loadAction();
    if (!action) return;

    await expect(action.getSalesAction({ take: 2 })).resolves.toEqual({
      sales: [{ id: "sale-a" }, { id: "sale-b" }],
      nextCursor: null,
    });
    expect(authMock).toHaveBeenCalledTimes(1);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { businessId: "business-a", paidStatus: "pago" },
      include: { items: true, client: true, returns: true },
      orderBy: { date: "desc" },
      take: 3,
    });
  });

  it("does not accept a caller-selected tenant and preserves cursor pagination", async () => {
    findManyMock.mockResolvedValueOnce([{ id: "sale-2" }, { id: "sale-3" }, { id: "ignored" }]);
    const action = await loadAction();
    if (!action) return;

    await expect(action.getSalesAction({ cursor: "sale-1", take: 2 })).resolves.toEqual({
      sales: [{ id: "sale-2" }, { id: "sale-3" }],
      nextCursor: "sale-3",
    });
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "business-a", paidStatus: "pago" },
      take: 3,
      cursor: { id: "sale-1" },
      skip: 1,
    }));
  });

  it("logs database failures and returns no database details", async () => {
    const secret = "PrismaClientKnownRequestError: private table details";
    findManyMock.mockRejectedValueOnce(new Error(secret));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const action = await loadAction();
    if (!action) return;

    await expect(action.getSalesAction()).resolves.toEqual({ sales: [], nextCursor: null });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
