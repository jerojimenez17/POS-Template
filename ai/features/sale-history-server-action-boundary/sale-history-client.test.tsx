import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SaleHistory from "@/components/Billing/SaleHistory";

const { getSaleHistoryMock } = vi.hoisted(() => ({ getSaleHistoryMock: vi.fn() }));
vi.mock("@/actions/sales/get-sale-history", () => ({ getSaleHistoryAction: getSaleHistoryMock }));

const componentSource = readFileSync(resolve(process.cwd(), "src/components/Billing/SaleHistory.tsx"), "utf8");

describe("SaleHistory request states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("imports only the dedicated action path and has no server-only runtime imports", () => {
    expect(componentSource).toContain('from "@/actions/sales/get-sale-history"');
    expect(componentSource).not.toContain('from "@/actions/sales"');
    expect(componentSource).not.toMatch(/from\s+["']@\/auth|from\s+["']@\/lib\/db/);
  });

  it.each([
    ["a non-empty result", Promise.resolve([{ id: "history-1", date: new Date(), updatedBy: { name: "Ana", email: "ana@example.com" }, version: 1, type: "STATUS_CHANGED", changes: { type: "STATUS_CHANGED", from: "a", to: "b" }, message: null }])],
    ["an empty result", Promise.resolve([])],
  ])("clears loading after %s", async (_label, result) => {
    getSaleHistoryMock.mockReturnValueOnce(result);
    render(<SaleHistory saleId="sale-1" />);
    await waitFor(() => expect(document.querySelector(".animate-spin")).not.toBeInTheDocument());
    if (result === undefined) return;
    if (Array.isArray(await result) && (await result).length === 0) {
      expect(screen.getByText(/no hay historial/i)).toBeVisible();
    } else {
      expect(screen.getByText(/historial de modificaciones/i)).toBeVisible();
    }
  });

  it("clears loading and visibly reports a rejected Error", async () => {
    getSaleHistoryMock.mockRejectedValueOnce(new Error("No autorizado"));
    render(<SaleHistory saleId="sale-1" />);
    expect(await screen.findByText(/no autorizado/i)).toBeVisible();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("clears loading and visibly reports a non-Error thrown value", async () => {
    getSaleHistoryMock.mockRejectedValueOnce("request failed");
    render(<SaleHistory saleId="sale-1" />);
    expect(await screen.findByText(/error/i)).toBeVisible();
    expect(screen.queryByText(/no hay historial/i)).not.toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });
});
