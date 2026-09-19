import { describe, expect, test } from 'vitest';
import { formatKES, formatKESShort, greeting } from '../utils/format';

describe('format helpers', () => {
  test('formats shillings', () => {
    expect(formatKES(1234.5)).toBe('Ksh 1,234.50');
    expect(formatKES()).toBe('Ksh 0.00');
    expect(formatKESShort(1000)).toBe('Ksh 1,000');
  });

  test('greets by time of day', () => {
    expect(greeting(new Date('2026-09-19T08:00:00'))).toBe('Good morning');
    expect(greeting(new Date('2026-09-19T14:00:00'))).toBe('Good afternoon');
    expect(greeting(new Date('2026-09-19T20:00:00'))).toBe('Good evening');
  });
});
