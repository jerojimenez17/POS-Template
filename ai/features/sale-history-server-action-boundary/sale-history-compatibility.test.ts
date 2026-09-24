import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as history from "@/actions/sales/history";
import * as sales from "@/actions/sales";

describe("sale history compatibility exports", () => {
  it("keeps the mapper synchronous and leaves history.ts without a server directive", () => {
    const source = readFileSync(resolve(process.cwd(), "src/actions/sales/history.ts"), "utf8");
    expect(source).not.toMatch(/^\s*[\"']use server[\"']/m);
    expect(history.mapOrderToBillState).toEqual(expect.any(Function));
    expect(source).toMatch(/export function mapOrderToBillState\s*\(/);
    expect(source).not.toMatch(/export async function mapOrderToBillState/);
  });

  it("retains the existing history actions and barrel action export", () => {
    expect(history.getDailyReportAction).toEqual(expect.any(Function));
    expect(history.getSalesAction).toEqual(expect.any(Function));
    expect(history.getSaleByIdAction).toEqual(expect.any(Function));
    expect(history.getSaleHistoryAction).toEqual(expect.any(Function));
    expect(sales.getSaleHistoryAction).toEqual(expect.any(Function));
  });
});
