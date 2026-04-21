"use client";

import { formatLocalDate } from "@/utils/date";

interface LocalDateProps {
  date: Date | string;
  className?: string;
}

/**
 * Client component that renders a date formatted in the user's local timezone.
 * Use this in Server Components to avoid UTC formatting on the server.
 */
export function LocalDate({ date, className }: LocalDateProps) {
  return (
    <time dateTime={new Date(date).toISOString()} className={className}>
      {formatLocalDate(date)}
    </time>
  );
}
