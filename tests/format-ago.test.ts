import { expect, it } from 'vitest';
import { formatAgo, formatCompactPacificTime, formatPacificStamp, xmlEscape } from '@/lib/format';

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

it('formats freshness chips in America/Los_Angeles with a PT or PDT label', () => {
  expect(formatPacificStamp('2026-07-11T12:00:00Z')).toBe('11 Jul 05:00 PDT');
  expect(formatPacificStamp('2026-10-01T00:10:00Z')).toBe('30 Sep 17:10 PDT');
  expect(formatPacificStamp('2026-01-15T15:14:00Z')).toBe('15 Jan 07:14 PT');
  expect(formatCompactPacificTime('2026-10-01T14:14:00Z')).toBe('7:14a PDT');
  expect(formatCompactPacificTime('2026-01-15T15:14:00Z')).toBe('7:14a PT');
});

it('escapes XML special characters', () => {
  expect(xmlEscape(`Fed & the "long" <end> of 'curve'`)).toBe(
    'Fed &amp; the &quot;long&quot; &lt;end&gt; of &apos;curve&apos;',
  );
});
