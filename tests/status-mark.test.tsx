import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ClaimsBook } from '@/components/ClaimsBook';
import { StatusMark, StatusMarkDefs } from '@/components/StatusMark';
import type { ClaimRecord } from '@/lib/queries/accountability';

function claim(id: string, status: string, kind = 'map', predicate?: string): ClaimRecord {
  return {
    claimId: id,
    status,
    kind,
    openedAt: '2026-09-01',
    resolvedAt: status === 'pending' ? null : '2026-09-04',
    expiresAt: '2026-09-04',
    payload: { predicate: predicate ?? `${id} closes above 1` },
  } as unknown as ClaimRecord;
}

// What a real cell title looks like: predicate, verdict and dates.
const REAL = '2Y Yield closes above 4.30% on 2026-09-11 (Fed / Inflation / Rates, settled by stored daily closes)';

it('a symbol mark references the shape library instead of inlining it', () => {
  const inline = renderToStaticMarkup(<StatusMark status="hit" title="t" />);
  const symbol = renderToStaticMarkup(<StatusMark status="hit" title="t" symbol />);
  expect(inline).toContain('<path d="M8 2.2');
  expect(symbol).toContain('<use href="#mk-hit"');
  expect(symbol).not.toContain('<path');
  expect(symbol).toContain('class="status-mark status-mark-ref"');
  expect(symbol).not.toContain('width=');
  expect(symbol.length).toBeLessThan(inline.length);
  // the <title> is the accessible name; no aria-label doubles it
  expect(symbol).not.toContain('aria-label');
  expect(inline).not.toContain('aria-label');
  expect(renderToStaticMarkup(<StatusMark status="hit" />)).toContain('aria-label="hit"');
  expect(renderToStaticMarkup(<StatusMark status="made-up" symbol />)).toContain('#mk-unknown');
  const defs = renderToStaticMarkup(<StatusMarkDefs />);
  for (const s of ['pending', 'hit', 'miss', 'partial', 'expired', 'judgment-required', 'void', 'unknown']) {
    expect(defs).toContain(`<symbol id="mk-${s}"`);
  }
});

it('the claim book draws the library once and every cell as a reference', () => {
  const claims = [
    claim('m0', 'hit'),
    ...Array.from({ length: 59 }, (_, i) => claim(`m${i + 1}`, i % 3 === 0 ? 'hit' : i % 3 === 1 ? 'miss' : 'pending', 'map', REAL)),
    ...Array.from({ length: 20 }, (_, i) => claim(`w${i}`, 'hit', 'smart_money', REAL)),
  ];
  const markup = renderToStaticMarkup(<ClaimsBook claims={claims} />);
  expect((markup.match(/<symbol id="mk-hit"/g) ?? []).length).toBe(1);
  expect((markup.match(/<use href="#mk-/g) ?? []).length).toBe(80);
  expect((markup.match(/<svg /g) ?? []).length).toBeGreaterThanOrEqual(81); // 80 cells + defs (+ legend)
  // every cell still carries its native tooltip
  expect(markup).toContain('<title>m0 closes above 1: correct, opened 2026-09-01, resolved 2026-09-04</title>');
  // and the page is materially lighter than inlining each shape
  const before = claims
    .map((c) => renderToStaticMarkup(<StatusMark status={c.status} title={REAL} symbol={false} />).replace('<title>', `aria-label="${REAL}"><title>`).replace('"><title', '<title'))
    .join('');
  const after = claims.map((c) => renderToStaticMarkup(<StatusMark status={c.status} title={REAL} symbol />)).join('');
  // roughly: the 2026-09-04 cells carried the title twice (aria-label plus <title>), size attributes and the full path
  expect(after.length).toBeLessThan(before.length * 0.65);
});
