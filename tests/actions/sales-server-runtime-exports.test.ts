import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/components/StockActivityModal", () => ({ StockActivityItem: {} }));

describe("sales server action runtime exports", () => {
  it("exports only callable values from the history action module", async () => {
    const historyModule = await import("@/actions/sales/history");

    expect(Object.keys(historyModule)).not.toContain("SalesQuerySchema");
    expect(Object.values(historyModule).every((value) => typeof value === "function")).toBe(true);
  });

  it("keeps the sales barrel runtime exports callable", async () => {
    const salesModule = await import("@/actions/sales");

    expect(Object.values(salesModule).every((value) => typeof value === "function")).toBe(true);
  });
});
