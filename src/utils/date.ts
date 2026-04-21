/**
 * Formats a date using the user's local browser timezone.
 * Uses es-AR locale for consistent DD/MM/YYYY HH:mm format.
 * NO hardcoded timezone — auto-detects from runtime environment.
 */
export const formatLocalDate = (date: Date | string): string => {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
};
