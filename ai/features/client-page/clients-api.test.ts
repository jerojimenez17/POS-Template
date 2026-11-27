import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/clients/route";

const { authMock, findMany } = vi.hoisted(() => ({ authMock: vi.fn(), findMany: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { client: { findMany } } }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) },
}));

describe("GET /api/clients compatibility contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 and does not query without an authenticated business", async () => {
    authMock.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No autorizado" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns the legacy { clients } shape filtered to the session business", async () => {
    authMock.mockResolvedValue({ user: { businessId: "business-a" } });
    findMany.mockResolvedValue([]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ clients: [] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "business-a" }, orderBy: { name: "asc" },
    }));
  });
});
