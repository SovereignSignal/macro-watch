import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { claimsBodySchema, upsertClaims } from '@/lib/ingest/claims';
import { getClaims, getClaimsPage, LEDGER_PAGE_SIZE } from '@/lib/queries/accountability';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: AccountabilityPage } = await import('@/app/accountability/page');

function page(sp: Record<string, string> = {}) {
  return AccountabilityPage({ searchParams: Promise.resolve(sp) });
}

function isoDaysAfter(start: string, days: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** n pending claims opened on distinct days, so ledger order is fully determined. */
function syntheticClaims(n: number, kind: 'smart_money' | 'map', prefix: string) {
  return Array.from({ length: n }, (_, i) => ({
    claim_id: `${prefix}-${String(i).padStart(3, '0')}`,
    kind,
    themes: [i % 2 === 0 ? 'rate-path-repricing' : 'dollar-downtrend'],
    predicate: `${prefix} claim ${i}`,
    opened_at: isoDaysAfter('2026-01-01', i),
    status: 'pending',
  }));
}

function ledgerOf(markup: string): string {
  return markup.slice(markup.indexOf('Public ledger'));
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
  expect(markup).toContain('rows 1–5 of 5'); // a single ledger page still reports its range
  expect(markup).toContain('1 of 8 decisions');
  expect(markup).toContain('1 correct');
  expect(markup).not.toContain('decision accuracy');
});

it('does not call a past expiry the next decision', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await page());
  expect(markup).toMatch(/listed markets are past their due date|listed market is past its due date/);
  expect(markup).not.toContain('Next decision: August 1, 2026');
  expect(markup).not.toContain('Next decision: July 31, 2026');
});

it('honest empty state with zero claims', async () => {
  await createTestDb();
  const markup = renderToStaticMarkup(await page());
  expect(markup).toContain('Tracking phase');
  expect(markup).toContain('Waiting for markets to settle.');
  expect(markup).toContain('Nobody grades anything on this page');
  expect(markup).toContain('There is no decide button');
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
  expect(markup).toContain('2 markets have settled.');
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
  expect(markup).toContain('1 map condition has no market that can settle it.');
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

it('pages the ledger 25 rows at a time, newest first, with no gaps or overlap', async () => {
  const db = await createTestDb();
  await upsertClaims(db, claimsBodySchema.parse(syntheticClaims(60, 'smart_money', 'pg')));
  expect(LEDGER_PAGE_SIZE).toBe(25);
  const first = await getClaimsPage(db, {}, 1);
  const second = await getClaimsPage(db, {}, 2);
  const third = await getClaimsPage(db, {}, 3);
  expect(first.rows).toHaveLength(25);
  expect(second.rows).toHaveLength(25);
  expect(third.rows).toHaveLength(10);
  expect([first.total, second.total, third.total]).toEqual([60, 60, 60]);
  expect(first.rows[0]?.claimId).toBe('pg-059'); // newest opened_at leads
  expect(third.rows.at(-1)?.claimId).toBe('pg-000'); // oldest closes the last page
  const ids = [...first.rows, ...second.rows, ...third.rows].map((c) => c.claimId);
  expect(new Set(ids).size).toBe(60);
  // Past the end clamps to the last page; nonsense clamps to the first.
  const beyond = await getClaimsPage(db, {}, 9);
  expect(beyond.page).toBe(3);
  expect(beyond.rows).toHaveLength(10);
  expect((await getClaimsPage(db, {}, 0)).page).toBe(1);
  expect((await getClaimsPage(db, {}, Number.NaN)).page).toBe(1);
  // The unpaged read still returns the whole record in the same order.
  expect((await getClaims(db)).map((c) => c.claimId)).toEqual(ids);
});

it('combines filters with paging and keeps them in the page links', async () => {
  const db = await createTestDb();
  await upsertClaims(
    db,
    claimsBodySchema.parse([...syntheticClaims(40, 'smart_money', 'wallet'), ...syntheticClaims(30, 'map', 'map')]),
  );
  const filtered = await getClaimsPage(db, { kind: 'map' }, 2);
  expect(filtered.total).toBe(30);
  expect(filtered.rows).toHaveLength(5);
  expect(filtered.rows.every((c) => c.kind === 'map')).toBe(true);

  const ledger = ledgerOf(renderToStaticMarkup(await page({ kind: 'map', page: '2' })));
  expect(ledger).toContain('rows 26–30 of 30');
  expect((ledger.slice(ledger.indexOf('<tbody>')).match(/<tr>/g) ?? []).length).toBe(5);
  expect(ledger).toContain('map claim 4</span>'); // the oldest five map claims
  expect(ledger).not.toContain('map claim 5</span>');
  expect(ledger).not.toContain('wallet claim');
  // Newer link keeps the filter; page 1 is the canonical unparameterized URL.
  expect(ledger).toContain('href="/accountability?kind=map"');
  expect(ledger).toContain('Newer entries');
  expect(ledger).not.toContain('Older entries');

  const firstPage = ledgerOf(renderToStaticMarkup(await page({ kind: 'smart_money' })));
  expect(firstPage).toContain('rows 1–25 of 40');
  expect(firstPage).toContain('href="/accountability?kind=smart_money&amp;page=2"');
  expect(firstPage).not.toContain('Newer entries');

  // Past the end clamps to the last page; garbage falls back to the first.
  expect(ledgerOf(renderToStaticMarkup(await page({ kind: 'smart_money', page: '99' })))).toContain('rows 26–40 of 40');
  expect(ledgerOf(renderToStaticMarkup(await page({ page: 'abc' })))).toContain('rows 1–25 of 70');
});

it('summary counts and the book cover the whole record on any page', async () => {
  const db = await createTestDb();
  await upsertClaims(
    db,
    claimsBodySchema.parse([...syntheticClaims(40, 'smart_money', 'wallet'), ...syntheticClaims(30, 'map', 'map')]),
  );
  const markup = renderToStaticMarkup(await page({ kind: 'map', page: '2' }));
  expect(markup).toContain('<dt>All entries</dt><dd>70</dd>');
  expect(markup).toContain('<dt>Listed markets</dt><dd>70</dd>');
  expect(markup).toContain('<dt>Settled</dt><dd>0</dd>');
  expect(markup).toContain('<dt>Still open</dt><dd>70</dd>');
  expect(markup).toContain('<dt>Not scored</dt><dd>0</dd>');
  expect(markup).toContain('70 listed markets are still open.');
  // Per-track counts in the book are unaffected by the ledger's filter or page.
  const book = markup.slice(markup.indexOf('Claim history'), markup.indexOf('Public ledger'));
  expect(book).toContain('Wallet signals <span class="book-count">40</span>');
  expect(book).toContain('Map calls <span class="book-count">30</span>');
  expect((book.match(/<svg /g) ?? []).length).toBeGreaterThanOrEqual(70);
});
