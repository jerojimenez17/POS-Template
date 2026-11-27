/**
 * Determines whether an order is overdue (unpaid and more than 30 days old).
 *
 * An order is considered overdue when ALL of the following conditions are true:
 * 1. `paidStatus === "inpago"` (the order is unpaid)
 * 2. `date < (current date - 30 days)` (the order was placed more than 30 days ago)
 * 3. `status !== "pendiente"` (the order is confirmed — pending orders are not overdue)
 *
 * @param order - The order object (or null/undefined).
 * @returns `true` if the order is overdue, `false` otherwise.
 */
export function isOrderOverdue(
  order: { date: Date; paidStatus: string; status: string } | null | undefined
): boolean {
  if (!order) return false;
  if (!order.date) return false;
  if (order.paidStatus !== "inpago") return false;
  if (order.status === "pendiente") return false;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  return new Date(order.date) < thirtyDaysAgo;
}
