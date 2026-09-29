import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { searchAll } from '@/lib/queries/search';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: SearchPage } = await import('@/app/search/page');
const { default: AboutPage } = await import('@/app/about/page');

it('finds briefs by words in the html body', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const results = await searchAll(db, 'term premium');
  const brief = results.find((r) => r.type === 'brief');
  expect(brief?.href).toBe('/briefs/2026-07-08/daily');
});

it('finds theme events by evidence and claims by predicate', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const events = (await searchAll(db, 'hawkish minutes')).filter((r) => r.type === 'theme-event');
  expect(events[0]?.href).toBe('/map/rate-path-repricing');
  const claimHits = (await searchAll(db, 'copper')).filter((r) => r.type === 'claim');
  expect(claimHits[0]?.href).toBe('/accountability');
  expect(claimHits[0]?.title).toContain('LME copper');
});

it('returns nothing for an empty or whitespace query', async () => {
  const db = await createTestDb();
  await seedAll(db);
  expect(await searchAll(db, '')).toEqual([]);
  expect(await searchAll(db, '   ')).toEqual([]);
});

it('never interpolates the query into SQL — quotes and injection attempts are safe, bound parameters', async () => {
  const db = await createTestDb();
  await seedAll(db);
  // A naive string-concatenation implementation would either throw (syntax
  // error from the unbalanced quote) or, worse, execute the injected clause.
  // A parameterized query treats all of this as inert search text and
  // returns a normal (empty) result set.
  await expect(searchAll(db, "term'; DROP TABLE briefs; --")).resolves.toEqual([]);
  await expect(searchAll(db, "o'brien")).resolves.toEqual([]);
  // Confirm the table really does survive: a legitimate search still works.
  const results = await searchAll(db, 'term premium');
  expect(results.find((r) => r.type === 'brief')?.href).toBe('/briefs/2026-07-08/daily');
});

it('search page renders results for ?q=', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(
    await SearchPage({ searchParams: Promise.resolve({ q: 'auction' }) }),
  );
  expect(markup).toContain('href="/briefs/2026-07-08/daily"');
  expect(markup).toMatch(/\d+ results?/);
});

it('search page renders a no-results state', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(
    await SearchPage({ searchParams: Promise.resolve({ q: 'zzzznope' }) }),
  );
  expect(markup).toContain('No results for');
});

it('about page explains the product and carries the disclaimer', () => {
  const markup = renderToStaticMarkup(<AboutPage />);
  expect(markup).toContain('About Sovs Macro');
  expect(markup).toContain('Sovs Macro is a Sovereign Signal project');
  expect(markup).not.toContain('macro.watch');
  expect(markup).not.toContain('SovsClaw');
  expect(markup).toContain('Brief HTML is sanitized before publication');
  expect(markup).toContain('Verified panels disclose source coverage and freshness');
  expect(markup).toContain('No investment advice');
  expect(markup).toContain('href="/accountability"');
  expect(markup).toContain('Week ahead');
  expect(markup).toContain('around 7:00 a.m. Pacific time');
  expect(markup).toContain('publishes on Saturday');
  expect(markup).toContain('Sunday afternoon Pacific time');
  expect(markup).not.toContain('14:00 UTC');
  expect(markup).not.toContain('17:00 UTC');
  expect(markup).not.toContain('23:00 UTC');
  expect(markup).toContain('Paid sources are paraphrased, not republished');
  expect(markup).not.toContain('Paywalled sources are never republished');
  expect(markup).toContain('hit rate counts hits divided by hits plus misses');
});
