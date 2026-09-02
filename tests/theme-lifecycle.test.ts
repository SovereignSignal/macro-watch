import { expect, it } from 'vitest';
import { DORMANT_AFTER_DAYS, displayStatus, isDormant } from '@/lib/theme-lifecycle';

const ASOF = '2026-09-01';

it('a candidate turns dormant after 45 days without an event, not at 45', () => {
  expect(DORMANT_AFTER_DAYS).toBe(45);
  const onTheLine = { status: 'candidate', lastEventAt: '2026-07-18' }; // 45 days before
  const pastIt = { status: 'candidate', lastEventAt: '2026-07-17' }; // 46 days before
  expect(displayStatus(onTheLine, ASOF)).toBe('candidate');
  expect(displayStatus(pastIt, ASOF)).toBe('dormant');
  expect(isDormant(onTheLine, ASOF)).toBe(false);
  expect(isDormant(pastIt, ASOF)).toBe(true);
});

it('counts days in UTC across month boundaries', () => {
  expect(displayStatus({ status: 'candidate', lastEventAt: '2026-01-16' }, '2026-03-02')).toBe(
    'candidate',
  ); // 45 days
  expect(displayStatus({ status: 'candidate', lastEventAt: '2026-01-15' }, '2026-03-02')).toBe(
    'dormant',
  ); // 46 days
});

it('only candidates go dormant: active and retired keep their status however old', () => {
  expect(displayStatus({ status: 'active', lastEventAt: '2025-01-01' }, ASOF)).toBe('active');
  expect(displayStatus({ status: 'retired', lastEventAt: '2025-01-01' }, ASOF)).toBe('retired');
});

it('a candidate with no event date, or a same-day or later one, stays a candidate', () => {
  expect(displayStatus({ status: 'candidate', lastEventAt: null }, ASOF)).toBe('candidate');
  expect(displayStatus({ status: 'candidate', lastEventAt: ASOF }, ASOF)).toBe('candidate');
  expect(displayStatus({ status: 'candidate', lastEventAt: '2026-09-15' }, ASOF)).toBe('candidate');
});
