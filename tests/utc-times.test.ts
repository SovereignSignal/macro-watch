import { describe, expect, it } from 'vitest';
import { buildFeed } from '@/lib/rss';
import { sanitizePublicBriefHtml } from '@/lib/security/public-brief-html';
import { convertTimesToUtc } from '@/lib/utc-times';

const CASES: { date: string; input: string; output: string }[] = [
  { date: '2026-08-09', input: 'as of 3:50 PM PT', output: 'as of 22:50 UTC' },
  { date: '2026-08-16', input: 'as of 3:50 PM PT', output: 'as of 22:50 UTC' },
  { date: '2026-08-16', input: '3:49 PM PT', output: '22:49 UTC' },
  { date: '2026-08-23', input: 'as of 3:50 PM PT', output: 'as of 22:50 UTC' },
  { date: '2026-08-30', input: 'as of 3:50 PM PT', output: 'as of 22:50 UTC' },
  { date: '2026-09-06', input: 'as of 3:50 PM PT', output: 'as of 22:50 UTC' },
  { date: '2026-09-13', input: 'as of 3:50 PM PT', output: 'as of 22:50 UTC' },
  { date: '2026-09-27', input: 'as of 3:55 PM PT', output: 'as of 22:55 UTC' },
  { date: '2026-09-30', input: 'Core PCE on Sep 30 at 8:30 ET', output: 'Core PCE on Sep 30 at 12:30 UTC' },
  { date: '2026-09-26', input: 'Core PCE on Sep 30 at 8:30 ET', output: 'Core PCE on Sep 30 at 12:30 UTC' },
  { date: '2026-09-01', input: 'September 4 at 8:30 a.m. ET', output: 'September 4 at 12:30 UTC' },
  { date: '2026-09-10', input: '1pm New York time', output: '17:00 UTC' },
  { date: '2026-07-14', input: '8:30 ET', output: '12:30 UTC' },
  { date: '2026-08-15', input: '6:30 a.m. ET', output: '10:30 UTC' },
  { date: '2026-12-10', input: '8:30 a.m. ET', output: '13:30 UTC' },
];

describe('convertTimesToUtc', () => {
  it.each(CASES)('$date $input → $output', ({ date, input, output }) => {
    expect(convertTimesToUtc(input, date)).toBe(output);
  });

  it('leaves text inside an href untouched and is idempotent on UTC', () => {
    const html = '<p>See <a href="https://example.com/8:30 ET" title="8:30 ET">the 8:30 ET print</a>.</p>';
    const converted = convertTimesToUtc(html, '2026-09-30');
    expect(converted).toContain('href="https://example.com/8:30 ET"');
    expect(converted).toContain('title="8:30 ET"');
    expect(converted).toContain('the 12:30 UTC print');
    expect(converted).not.toContain('>the 8:30 ET print');
    expect(convertTimesToUtc('12:30 UTC', '2026-09-30')).toBe('12:30 UTC');
    expect(convertTimesToUtc(converted, '2026-09-30')).toBe(converted);
  });

  it('converts brief HTML text nodes when a date is passed to the sanitizer', () => {
    const clean = sanitizePublicBriefHtml(
      '<p>Core PCE on Sep 30 at 8:30 ET.</p><a href="https://www.federalreserve.gov/newsevents.htm">8:30 ET</a>',
      '2026-09-29',
    );
    expect(clean).toContain('12:30 UTC');
    expect(clean).toContain('href="https://www.federalreserve.gov/newsevents.htm"');
    expect(clean).not.toContain('8:30 ET');
  });
});

it('converts Eastern clocks in RSS item text', () => {
  const xml = buildFeed([{
    date: '2026-09-30',
    kind: 'daily',
    subject: 'PCE day',
    ping: 'Core PCE at 8:30 ET.',
    sentVerifiedAt: new Date('2026-09-30T14:05:00Z'),
  }]);
  expect(xml).toContain('Core PCE at 12:30 UTC.');
  expect(xml).not.toContain('8:30 ET');
});
