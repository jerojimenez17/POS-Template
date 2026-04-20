import { describe, it, expect } from 'vitest';
import { formatLocalDate } from '../utils/date';

/**
 * Tests for the date utility function to ensure it formats dates
 * according to the DD/MM/YYYY HH:mm pattern using the local timezone.
 */
describe('formatLocalDate', () => {
  // Pattern: 2 digits for day, month, 4 for year, space, 2 for hour, colon, 2 for minute
  const dateRegex = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;

  it('should format a Date object consistently with the required pattern', () => {
    const date = new Date('2024-05-20T15:30:00Z');
    const result = formatLocalDate(date);
    expect(result).toMatch(dateRegex);
  });

  it('should accept and correctly format an ISO date string', () => {
    const isoString = '2024-12-31T23:59:00Z';
    const result = formatLocalDate(isoString);
    expect(result).toMatch(dateRegex);
  });

  it('should pad single digit values with leading zeros', () => {
    // January 1st, 05:05 AM
    const date = new Date('2024-01-01T05:05:00Z');
    const result = formatLocalDate(date);

    expect(result).toMatch(dateRegex);
    expect(result.length).toBe(16); // "DD/MM/YYYY HH:mm" is always 16 chars

    // Verify specific separator positions
    expect(result.charAt(2)).toBe('/');
    expect(result.charAt(5)).toBe('/');
    expect(result.charAt(10)).toBe(' ');
    expect(result.charAt(13)).toBe(':');
  });

  it('should handle edge cases like midnight and noon', () => {
    const midnight = new Date('2024-06-15T00:00:00Z');
    const noon = new Date('2024-06-15T12:00:00Z');

    expect(formatLocalDate(midnight)).toMatch(dateRegex);
    expect(formatLocalDate(noon)).toMatch(dateRegex);
  });
});
