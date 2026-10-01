import { expect, it } from 'vitest';
import { formatAgo, formatCompactUtcTime, formatUtcStamp, xmlEscape } from '@/lib/format';

const T0 = Date.parse('2026-07-11T12:00:00Z');

it('renders sub-minute as just now', () => {
  expect(formatAgo(T0 - 30_000, T0)).toBe('just now');
});

it('renders minutes, hours, days', () => {
  expect(formatAgo(T0 - 3 * 60_000, T0)).toBe('3m ago');
  expect(formatAgo(T0 - 2 * 3_600_000, T0)).toBe('2h ago');
  expect(formatAgo(T0 - 3 * 86_400_000, T0)).toBe('3d ago');
});

it('clamps clock skew to just now', () => {
  expect(formatAgo(T0 + 60_000, T0)).toBe('just now');
});

it('formats freshness chips in 24-hour UTC', () => {
  expect(formatUtcStamp('2026-07-11T12:00:00Z')).toBe('11 Jul 12:00 UTC');
  expect(formatUtcStamp('2026-10-01T00:10:00Z')).toBe('1 Oct 00:10 UTC');
  expect(formatUtcStamp('2026-01-15T15:14:00Z')).toBe('15 Jan 15:14 UTC');
  expect(formatCompactUtcTime('2026-10-01T14:14:00Z')).toBe('14:14 UTC');
  expect(formatCompactUtcTime('2026-01-15T15:14:00Z')).toBe('15:14 UTC');
});

it('escapes XML special characters', () => {
  expect(xmlEscape(`Fed & the "long" <end> of 'curve'`)).toBe(
    'Fed &amp; the &quot;long&quot; &lt;end&gt; of &apos;curve&apos;',
  );
});
