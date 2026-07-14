import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { claimsBodySchema, upsertClaims } from '@/lib/ingest/claims';
import { getClaims } from '@/lib/queries/accountability';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: AccountabilityPage } = await import('@/app/accountability/page');

function page(sp: Record<string, string> = {}) {
  return AccountabilityPage({ searchParams: Promise.resolve(sp) });
}

it('getClaims filters by kind, status, theme, and quality class', async () => {
  const db = await createTestDb();
  await seedAll(db);
  expect(await getClaims(db)).toHaveLength(5);
  expect(await getClaims(db, { kind: 'smart_money' })).toHaveLength(2);
  expect(await getClaims(db, { status: 'pending' })).toHaveLength(2);
  expect(await getClaims(db, { theme: 'rate-path-repricing' })).toHaveLength(2);
  expect(await getClaims(db, { kind: 'map', theme: 'dollar-downtrend' })).toHaveLength(1);
  expect(await getClaims(db, { qualityClass: 'rates' })).toHaveLength(2);
  expect(await getClaims(db, { qualityClass: 'unclassified' })).toHaveLength(0);
});

it('orients the reader and renders track scoreboards below the headline-rate floor', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await page());
  expect(markup).toContain('Accountability');
  expect(markup).toContain('How the record works');
  expect(markup).toContain('Decided claims by theme');
  expect(markup).toContain('Decided claims by evidence type');
  expect(markup).toContain('rates'); // market_type class board
  expect(markup).toContain('2y UST closes above 4.40%'); // claims table row
  expect(markup).toContain('1 of 8 decisions');
  expect(markup).toContain('1 correct');
  expect(markup).not.toContain('decision accuracy');
});

it('honest empty state with zero claims', async () => {
  await createTestDb();
  const markup = renderToStaticMarkup(await page());
  expect(markup).toContain('Tracking phase');
  expect(markup).toContain('No eligible claims have resolved yet.');
});

it('filters narrow the table but never the scoreboards', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await page({ status: 'miss' }));
  // The book above the ledger always shows every claim (no memory-holing), so
  // scope the narrowing assertions to the ledger table itself.
  const ledger = markup.slice(markup.indexOf('Public ledger'));
  expect(ledger).toContain('LME copper closes above'); // the one miss claim
  expect(ledger).not.toContain('EURUSD trades 1.14'); // expired claim filtered out of table
  // Scoreboards are still computed from the full ledger, filter or no.
  expect(markup).toContain('2 decisions recorded.');
});

it('the quality class filter narrows the table by market_type', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await page({ class: 'commodities' }));
  const ledger = markup.slice(markup.indexOf('Public ledger'));
  expect(ledger).toContain('LME copper closes above'); // the one commodities claim
  expect(ledger).not.toContain('2y UST closes above 4.40%'); // a rates claim, filtered out
});

it('renders judgment-only flip conditions with human predicate and subtype', async () => {
  const db = await createTestDb();
  await upsertClaims(
    db,
    claimsBodySchema.parse({
      claim_id: 'map:flip:1',
      kind: 'map',
      themes: ['credit-private-markets'],
      predicate: 'Lower if losses broaden into public credit.',
      opened_at: '2026-07-11',
      status: 'judgment-required',
      claim_kind: 'flip-condition',
      checkable: false,
    }),
  );
  const markup = renderToStaticMarkup(await page());
  expect(markup).toContain('Lower if losses broaden into public credit.');
  expect(markup).toContain('qualitative map review');
  expect(markup).toContain('1 flip condition needs human review.');
  expect(markup).not.toContain('map:flip:1</td>');
});

it('crossing the track sample threshold reveals decision accuracy', async () => {
  const db = await createTestDb();
  await seedAll(db);
  // Map-derived claims already carry one miss. Add six hits and one miss so
  // that track reaches eight final decisions and can show a headline rate.
  const extra = Array.from({ length: 7 }, (_, i) => ({
    claim_id: `cl-extra-${i}`,
    kind: 'map',
    themes: ['rate-path-repricing'],
    predicate: `synthetic claim ${i}`,
    opened_at: '2026-07-01',
    status: i < 6 ? 'hit' : 'miss',
    resolved_at: '2026-07-12',
  }));
  await upsertClaims(db, claimsBodySchema.parse(extra));
  const markup = renderToStaticMarkup(await page());
  expect(markup).toContain('75%'); // map track: 6 hits / 8 decisions
  expect(markup).toContain('88%'); // theme: seed hit + 6 hits / 8 decisions
  expect(markup).toContain('accuracy');
});
