// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isOrderOverdue } from "@/utils/overdue";

/**
 * Helper to create a minimal OrderWithClient-shaped object for testing.
 * All non-specified fields get sensible defaults.
 */
function createOrder(overrides: Partial<{
  id: string;
  date: Date;
  total: number;
  status: string;
  paidStatus: string;
  clientId: string | null;
  client: { id: string; name: string | null } | null;
}> = {}) {
  return {
    id: "test-order-id",
    date: new Date(),
    total: 1000,
    status: "confirmado",
    paidStatus: "inpago",
    clientId: "client-1",
    client: { id: "client-1", name: "Test Client" },
    ...overrides,
  };
}

describe("isOrderOverdue", () => {
  // ──────────────────────────────────────────────
  // AC-01: Overdue when all three conditions met
  // ──────────────────────────────────────────────
  it("AC-01: returns true when paidStatus=inpago, status≠pendiente, date>30 days ago", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);
    const order = createOrder({ date: oldDate });
    expect(isOrderOverdue(order)).toBe(true);
  });

  // ──────────────────────────────────────────────
  // AC-02: NOT overdue for recent unpaid orders
  // ──────────────────────────────────────────────
  it("AC-02: returns false when date < 30 days ago (recent unpaid)", () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const order = createOrder({ date: recentDate });
    expect(isOrderOverdue(order)).toBe(false);
  });

  // ──────────────────────────────────────────────
  // AC-03: NOT overdue for paid orders
  // ──────────────────────────────────────────────
  it("AC-03: returns false when paidStatus=pago even if date>30 days ago", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const order = createOrder({ date: oldDate, paidStatus: "pago" });
    expect(isOrderOverdue(order)).toBe(false);
  });

  // ──────────────────────────────────────────────
  // AC-04: NOT overdue for pending orders
  // ──────────────────────────────────────────────
  it("AC-04: returns false when status=pendiente even if date>30 days ago", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const order = createOrder({ date: oldDate, status: "pendiente" });
    expect(isOrderOverdue(order)).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────
  // AC-07: Exactly 30 days ago at midnight is NOT overdue
  // ──────────────────────────────────────────────────────────────
  it("AC-07: returns false when date is exactly 30 days ago at midnight (boundary)", () => {
    const midnight30DaysAgo = new Date();
    midnight30DaysAgo.setDate(midnight30DaysAgo.getDate() - 30);
    midnight30DaysAgo.setHours(0, 0, 0, 0);
    const order = createOrder({ date: midnight30DaysAgo });
    expect(isOrderOverdue(order)).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────
  // AC-08: 30 days + 1ms ago IS overdue
  // ──────────────────────────────────────────────────────────────
  it("AC-08: returns true when date is 30 days ago minus 1ms (just past boundary)", () => {
    const midnight30DaysAgo = new Date();
    midnight30DaysAgo.setDate(midnight30DaysAgo.getDate() - 30);
    midnight30DaysAgo.setHours(0, 0, 0, 0);

    const oneMsBeforeMidnight = new Date(midnight30DaysAgo);
    oneMsBeforeMidnight.setMilliseconds(oneMsBeforeMidnight.getMilliseconds() - 1);

    const order = createOrder({ date: oneMsBeforeMidnight });
    expect(isOrderOverdue(order)).toBe(true);
  });

  // ──────────────────────────────────────────────
  // Edge case: future date → NOT overdue
  // ──────────────────────────────────────────────
  it("returns false when date is in the future", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const order = createOrder({ date: futureDate });
    expect(isOrderOverdue(order)).toBe(false);
  });

  // ──────────────────────────────────────────────
  // Edge case: status=entregado (confirmed, not pending) → CAN be overdue
  // ──────────────────────────────────────────────
  it("returns true when status=entregado, old, and unpaid", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);
    const order = createOrder({ date: oldDate, status: "entregado" });
    expect(isOrderOverdue(order)).toBe(true);
  });

  // ──────────────────────────────────────────────
  // Edge case: status=consignacion (confirmed, not pending) → CAN be overdue
  // ──────────────────────────────────────────────
  it("returns true when status=consignacion, old, and unpaid", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);
    const order = createOrder({ date: oldDate, status: "consignacion" });
    expect(isOrderOverdue(order)).toBe(true);
  });

  // ──────────────────────────────────────────────
  // Edge case: non-inpago paidStatus values
  // ──────────────────────────────────────────────
  it("returns false when paidStatus is a non-inpago value (e.g., cancelado)", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);
    const order = createOrder({ date: oldDate, paidStatus: "cancelado" });
    expect(isOrderOverdue(order)).toBe(false);
  });

  // ──────────────────────────────────────────────
  // Edge case: null guard for date (SPEC edge case #2)
  // ──────────────────────────────────────────────
  it("returns false when date is null (null guard)", () => {
    const order = createOrder({ date: null as unknown as Date });
    expect(isOrderOverdue(order)).toBe(false);
  });

  // ──────────────────────────────────────────────
  // Edge case: date is undefined
  // ──────────────────────────────────────────────
  it("returns false when date is undefined", () => {
    const order = createOrder({ date: undefined as unknown as Date });
    expect(isOrderOverdue(order)).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────
  // Edge case: Leap year / month boundaries (SPEC edge case #8)
  // Tests that setDate(getDate() - 30) handles calendar correctly
  // ──────────────────────────────────────────────────────────────
  it("handles month boundary crossing correctly (e.g., from March 31 go back 30 days)", () => {
    // March 31 minus 30 days = March 1 (not February 30 which would be invalid)
    const march31 = new Date(2026, 2, 31); // March 31, 2026
    const order = createOrder({ date: march31 });

    // Today is July 18, 2026. thirtyDaysAgo = June 18, 2026.
    // March 31 < June 18 → true → overdue
    expect(isOrderOverdue(order)).toBe(true);
  });

  // ──────────────────────────────────────────────
  // Edge case: different string statuses that aren't "pendiente"
  // All non-pendiente statuses should allow overdue if other conditions met
  // ──────────────────────────────────────────────
  it("returns true for any non-pendiente status when other conditions are met", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);
    const statuses = ["confirmado", "entregado", "consignacion", "cancelado", ""];
    for (const status of statuses) {
      const order = createOrder({ date: oldDate, status });
      expect(isOrderOverdue(order)).toBe(true);
    }
  });

  // ──────────────────────────────────────────────
  // Edge case: today's date (current) → NOT overdue
  // ──────────────────────────────────────────────
  it("returns false for an order placed today", () => {
    const order = createOrder({ date: new Date() });
    expect(isOrderOverdue(order)).toBe(false);
  });

  // ──────────────────────────────────────────────
  // Edge case: 29 days ago → NOT overdue
  // ──────────────────────────────────────────────
  it("returns false for an order 29 days ago", () => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    const order = createOrder({ date });
    expect(isOrderOverdue(order)).toBe(false);
  });

  // ──────────────────────────────────────────────
  // Edge case: 31 days ago → IS overdue
  // ──────────────────────────────────────────────
  it("returns true for an order 31 days ago", () => {
    const date = new Date();
    date.setDate(date.getDate() - 31);
    const order = createOrder({ date });
    expect(isOrderOverdue(order)).toBe(true);
  });
});
