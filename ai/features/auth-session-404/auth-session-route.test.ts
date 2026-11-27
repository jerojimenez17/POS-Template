import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const featureDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(featureDirectory, "../../..");
const routePath = resolve(
  repositoryRoot,
  "src/app/api/auth/[...nextauth]/route.ts",
);

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  handlers: {
    GET: mockGet,
    POST: mockPost,
  },
}));

describe("Auth.js App Router session route", () => {
  it("keeps the canonical catch-all route and directly exports Auth.js handlers", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toMatch(/import\s*\{\s*handlers\s*\}\s*from\s*["']@\/auth["']/);
    expect(source).toMatch(
      /export\s+const\s*\{\s*GET\s*,\s*POST\s*\}\s*=\s*handlers/,
    );
    expect(source).not.toMatch(/NextResponse|JSON\.stringify|async\s+function\s+(GET|POST)/);
  });

  it("does not add a competing session route or page", () => {
    const authFiles = collectFiles(resolve(repositoryRoot, "src/app/api/auth"));
    const duplicateSessionFiles = authFiles.filter((path) => {
      const normalized = relative(repositoryRoot, path).replaceAll("\\", "/");
      return (
        normalized !== "src/app/api/auth/[...nextauth]/route.ts" &&
        /(?:^|\/)session(?:\/|\.|$)/i.test(normalized)
      );
    });

    expect(duplicateSessionFiles).toEqual([]);
  });
});

describe("Auth.js session response contract", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("delegates an unauthenticated session request and returns Auth.js JSON null", async () => {
    mockGet.mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { GET } = await import("@/app/api/auth/[...nextauth]/route");
    const response = await GET(
      new Request("http://localhost/api/auth/session") as Parameters<typeof GET>[0],
    );

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toBeNull();
  });

  it("preserves callback-populated authenticated session fields without rewriting JSON", async () => {
    const session = {
      user: {
        id: "user-1",
        role: "ADMIN",
        businessId: "business-1",
        businessName: "Test business",
        businessSlug: "test-business",
        image: "https://example.test/avatar.png",
      },
      expires: "2099-01-01T00:00:00.000Z",
    };
    mockGet.mockResolvedValue(
      new Response(JSON.stringify(session), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { GET } = await import("@/app/api/auth/[...nextauth]/route");
    const response = await GET(
      new Request("http://localhost/api/auth/session", {
        headers: { cookie: "authjs.session-token=test-session" },
      }) as Parameters<typeof GET>[0],
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(session);
    expect(body.user).toMatchObject(session.user);
  });

  it("never exposes the HTML 404 document for a matched session endpoint", async () => {
    mockGet.mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { GET } = await import("@/app/api/auth/[...nextauth]/route");
    const response = await GET(
      new Request("http://localhost/api/auth/session") as Parameters<typeof GET>[0],
    );
    const text = await response.text();

    expect(text.trimStart()).not.toMatch(/^<!DOCTYPE/i);
    expect(() => JSON.parse(text)).not.toThrow();
  });
});
