import { expect, it } from 'vitest';
import { formatDate } from '@/lib/format';

it('formats an ISO date for display', () => {
  expect(formatDate('2026-07-11')).toBe('July 11, 2026');
});

it('does not zero-pad the day', () => {
  expect(formatDate('2026-01-05')).toBe('January 5, 2026');
});
