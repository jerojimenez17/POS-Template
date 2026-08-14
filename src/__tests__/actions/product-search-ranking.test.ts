import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProductsPaginated } from "@/actions/stock";

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1", businessId: "business-123" } }),
}));

interface MockProduct {
  id: string;
  code: string | null;
  codebar: string | null;
  description: string | null;
}

const product = (id: string, description: string | null, code = id): MockProduct => ({
  id,
  code,
  codebar: null,
  description,
});

const queryParts = (query: unknown): { text: string; values: unknown[] } => {
  const sql = query as { strings?: unknown[]; values?: unknown[] };
  return {
    text: Array.isArray(sql.strings) ? sql.strings.map(String).join(" ") : String(query),
    values: Array.isArray(sql.values) ? sql.values : [],
  };
};

const containsValue = (values: unknown[], expected: string): boolean =>
  values.some((value) =>
    value === expected ||
    (Array.isArray(value) && containsValue(value, expected)) ||
    (typeof value === "object" && value !== null && containsValue(Object.values(value), expected))
  );

describe("getProductsPaginated product-search ranking", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@/lib/db");
    (db.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries),
    );
  });

  it("puts complete description prefixes ahead of later matches and keeps exact-code precedence", async () => {
    const { db } = await import("@/lib/db");
    const products = [
      product("exact", "Producto acido", "ACIDO-001"),
      product("prefix-a", "Acido citrico"),
      product("prefix-b", "Acidificante"),
      product("later", "Producto acido"),
    ];
    (db.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue(
      products.map(({ id }) => ({ id })),
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(products);

    const result = await getProductsPaginated({ search: "acido", pageSize: 10 });

    expect(result.products.map((item) => item.id)).toEqual([
      "exact",
      "prefix-a",
      "prefix-b",
      "later",
    ]);
    const query = queryParts((db.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(query.text).toMatch(/description/i);
    expect(query.text).toMatch(/prefix|starts|left\s*\(/i);
    expect(query.text.indexOf("prefix")).toBeLessThan(query.text.indexOf("similarity"));
  });

  it("normalizes case, surrounding whitespace, and preserves a complete multi-word phrase", async () => {
    const { db } = await import("@/lib/db");
    (db.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "p1" }]);
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      product("p1", "Leche descremada larga"),
    ]);

    await getProductsPaginated({ search: "  LeChE DeScReMaDa  " });

    const query = queryParts((db.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(containsValue(query.values, "leche descremada")).toBe(true);
    expect(query.text).toMatch(/lower|ilike/i);
    expect(query.text).toMatch(/description/i);
  });

  it("uses a null-safe prefix expression and deterministic tie-breakers", async () => {
    const { db } = await import("@/lib/db");
    (db.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getProductsPaginated({ search: "acido" });

    const query = queryParts((db.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(query.text).toMatch(/coalesce\([^)]*description/i);
    expect(query.text).toMatch(/description.*asc|description.*desc/i);
    expect(query.text).toMatch(/p\."id"|id.*asc/i);
  });

  it("ranks before slicing so a later page cannot hide a prefix result", async () => {
    const { db } = await import("@/lib/db");
    const orderedIds = ["prefix-1", "prefix-2", "non-prefix-1", "non-prefix-2"];
    (db.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue(
      orderedIds.map((id) => ({ id })),
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      product("non-prefix-1", "Producto acido"),
      product("non-prefix-2", "Otro producto acido"),
      product("prefix-2", "Acido dos"),
    ]);

    const result = await getProductsPaginated({ search: "acido", page: 2, pageSize: 2 });

    expect(result.page).toBe(2);
    expect(result.total).toBe(4);
    expect(result.totalPages).toBe(2);
    expect(result.products.map((item) => item.id)).toEqual(["non-prefix-1", "non-prefix-2"]);
    const query = queryParts((db.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(query.text).not.toMatch(/LIMIT\s+1000/i);
  });

  it("preserves business and category, brand, and unit filters in ranked SQL", async () => {
    const { db } = await import("@/lib/db");
    await getProductsPaginated({
      search: "acido",
      categoryId: "category-1",
      brandId: "brand-1",
      unit: "kg",
    });

    const query = queryParts((db.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(containsValue(query.values, "business-123")).toBe(true);
    expect(containsValue(query.values, "category-1")).toBe(true);
    expect(containsValue(query.values, "brand-1")).toBe(true);
    expect(containsValue(query.values, "kg")).toBe(true);
  });

  it("does not use description prefix ranking in codeOnly mode", async () => {
    const { db } = await import("@/lib/db");
    await getProductsPaginated({ search: "ACIDO", codeOnly: true });

    const query = queryParts((db.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(query.text).not.toMatch(/p\."description"/i);
    expect(query.text).not.toMatch(/prefix|starts|left\s*\(/i);
  });

  it("keeps exactCode lookup out of the ranked query and preserves its response shape", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      product("p1", null, "ACIDO"),
    ]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await getProductsPaginated({ search: "ACIDO", exactCode: true });

    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(result).toMatchObject({ page: 1, pageSize: 25, total: 1, totalPages: 1 });
    expect(result.products).toHaveLength(1);
  });

  it("does not invoke ranked SQL for empty or short searches", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsPaginated({ search: "" });
    await getProductsPaginated({ search: "ac" });

    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("keeps prefix matches ahead of other ILIKE matches when pg_trgm is unavailable", async () => {
    const { db } = await import("@/lib/db");
    (db.$queryRaw as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("pg_trgm unavailable"));
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      product("later", "Producto acido"),
      product("prefix", "Acido citrico"),
      product("null", null),
    ]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    const result = await getProductsPaginated({ search: "acido", pageSize: 3 });

    expect(result.products.map((item) => item.id)).toEqual(["prefix", "later", "null"]);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: expect.not.objectContaining({ description: "asc" }) }),
    );
  });
});
