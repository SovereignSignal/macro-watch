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

it('renders scoreboards from the seeded ledger, honestly suppressed below sample thresholds', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await page());
  expect(markup).toContain('Accountability');
  expect(markup).toContain('By theme');
  expect(markup).toContain('By quality class');
  expect(markup).toContain('rates'); // market_type class board
  expect(markup).toContain('2y UST closes above 4.40%'); // claims table row
  // 5 seeded claims -> 2 resolved overall (1 hit, 1 miss). That's well below
  // the 8-resolved floor, so the honest empty state renders instead of a
  // bare "50%" that would overstate confidence on two claims.
  expect(markup).toContain('2 resolved — not enough to grade yet.');
  expect(markup).not.toContain('batting average');
});

it('honest empty state with zero claims', async () => {
  await createTestDb();
  const markup = renderToStaticMarkup(await page());
  expect(markup).toContain('0 resolved — not enough to grade yet.');
});

it('filters narrow the table but never the scoreboards', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await page({ status: 'miss' }));
  expect(markup).toContain('LME copper closes above'); // the one miss claim
  expect(markup).not.toContain('EURUSD trades 1.14'); // expired claim filtered out of table
  // Scoreboards are still computed from the full ledger, filter or no.
  expect(markup).toContain('2 resolved — not enough to grade yet.');
});

it('the quality class filter narrows the table by market_type', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await page({ class: 'commodities' }));
  expect(markup).toContain('LME copper closes above'); // the one commodities claim
  expect(markup).not.toContain('2y UST closes above 4.40%'); // a rates claim, filtered out
});

it('crossing the sample threshold flips a board from suppressed to a numeric batting average', async () => {
  const db = await createTestDb();
  await seedAll(db);
  // rate-path-repricing already carries 1 hit (pending claim stays pending).
  // Add 5 hits + 1 miss, all themed rate-path-repricing: the theme reaches
  // 7 resolved (over its 4-sample floor) and the overall ledger reaches
  // 8 resolved (exactly its floor) in the same stroke.
  const extra = Array.from({ length: 6 }, (_, i) => ({
    claim_id: `cl-extra-${i}`,
    kind: 'map',
    themes: ['rate-path-repricing'],
    predicate: `synthetic claim ${i}`,
    opened_at: '2026-07-01',
    status: i < 5 ? 'hit' : 'miss',
  }));
  await upsertClaims(db, claimsBodySchema.parse(extra));
  const markup = renderToStaticMarkup(await page());
  // Overall: hits = 1 (seed) + 5 = 6, misses = 1 (seed) + 1 = 2, resolved = 8.
  expect(markup).toContain('75%'); // 6/8, at the floor
  // rate-path-repricing: hits = 1 + 5 = 6, misses = 0 + 1 = 1, resolved = 7.
  expect(markup).toContain('86%'); // round(6/7 * 100)
  expect(markup).toContain('batting average');
});
