import { expect, it } from 'vitest';
import { formatAgo, formatUtcStamp, xmlEscape } from '@/lib/format';

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

it('formats a stable UTC stamp for SSR freshness chips', () => {
  expect(formatUtcStamp('2026-07-11T12:00:00Z')).toBe('11 Jul 12:00 UTC');
});

it('escapes XML special characters', () => {
  expect(xmlEscape(`Fed & the "long" <end> of 'curve'`)).toBe(
    'Fed &amp; the &quot;long&quot; &lt;end&gt; of &apos;curve&apos;',
  );
});
