import { customType } from 'drizzle-orm/sqlite-core';

/** `YYYY-MM-DD HH:MM:SS[.fff]`, the UTC form SQLite's CURRENT_TIMESTAMP writes */
const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

/** Ends in `Z` or a `±HH:MM` offset */
const HAS_TIME_ZONE = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Read a stored date. Both forms Astro DB wrote are UTC: ISO 8601 (from a Date it was given)
 * and SQLite's `YYYY-MM-DD HH:MM:SS` (from its CURRENT_TIMESTAMP default).
 * @throws Error when the text is not a date
 */
export function parseStoredDate(value: string): Date {
  const iso = SQLITE_TIMESTAMP.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const date = new Date(HAS_TIME_ZONE.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Stored comment date is not a date: ${JSON.stringify(value)}`);
  }
  return date;
}

/**
 * A date kept as text, the way Astro DB's `column.date()` keeps it, so a table Astro DB
 * created is read and written unchanged.
 */
export const textDate = customType<{ data: Date; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value: Date): string {
    return value.toISOString();
  },
  fromDriver(value: string): Date {
    return parseStoredDate(value);
  },
});
