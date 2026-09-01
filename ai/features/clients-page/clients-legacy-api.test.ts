import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, findManyMock } = vi.hoisted(() => ({ authMock: vi.fn(), findManyMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { client: { findMany: findManyMock } } }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) },
}));

describe("legacy client selection API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the { clients } response and authenticates the business", async () => {
    authMock.mockResolvedValue({ user: { businessId: "business-a" } });
    findManyMock.mockResolvedValue([{ id: "a", name: "Ana" }]);
    const { GET } = await import("@/app/api/clients/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ clients: [{ id: "a", name: "Ana" }] });
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: "business-a" } }));
  });

  it("returns 401 without querying for an unauthenticated or businessless session", async () => {
    authMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: {} });
    const { GET } = await import("@/app/api/clients/route");
    expect((await GET()).status).toBe(401);
    expect((await GET()).status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
