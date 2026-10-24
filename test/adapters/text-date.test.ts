import { describe, expect, it } from 'vitest';
import { parseStoredDate } from '../../src/adapters/sqlite';

describe('parseStoredDate', () => {
  it.each([
    ['SQLite CURRENT_TIMESTAMP text', '2025-03-04 05:06:07', '2025-03-04T05:06:07.000Z'],
    ['SQLite text with fractional seconds', '2025-03-04 05:06:07.123', '2025-03-04T05:06:07.123Z'],
    ['ISO 8601 in UTC', '2025-03-04T05:06:07.123Z', '2025-03-04T05:06:07.123Z'],
    ['ISO 8601 with an offset', '2025-03-04T07:06:07+02:00', '2025-03-04T05:06:07.000Z'],
    ['ISO 8601 with no zone, read as UTC', '2025-03-04T05:06:07', '2025-03-04T05:06:07.000Z'],
  ])('reads %s', (_label, stored, expected) => {
    expect(parseStoredDate(stored).toISOString()).toBe(expected);
  });

  it('throws on text that is not a date', () => {
    expect(() => parseStoredDate('yesterday')).toThrow('not a date');
  });
});
