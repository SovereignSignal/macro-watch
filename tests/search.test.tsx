import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { upsertBrief } from '@/lib/ingest/briefs';
import { upsertResearch } from '@/lib/ingest/research';
import { searchAll } from '@/lib/queries/search';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const session = vi.hoisted(() => ({ member: false }));

// next/headers cookies() fails outside a request, so stub the session.
vi.mock('@/lib/member-session', () => ({
  isMember: async () => session.member,
}));

const { default: SearchPage } = await import('@/app/search/page');
const { default: AboutPage, dynamic: aboutDynamic } = await import('@/app/about/page');

beforeEach(() => {
  session.member = false;
});

it('finds briefs by words in the html body', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const results = await searchAll(db, 'term premium');
  const brief = results.find((r) => r.type === 'brief');
  expect(brief?.href).toBe('/briefs/2026-07-08/daily');
});

it('finds theme events by evidence and claims by predicate (members)', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const events = (await searchAll(db, 'hawkish minutes')).filter((r) => r.type === 'theme-event');
  expect(events[0]?.href).toBe('/map/rate-path-repricing');
  const claimHits = (await searchAll(db, 'copper', { includeClaims: true })).filter((r) => r.type === 'claim');
  expect(claimHits[0]?.href).toBe('/accountability');
  expect(claimHits[0]?.title).toContain('LME copper');
});

it('excludes claim hits unless the caller opts in (fail closed)', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const without = await searchAll(db, 'copper');
  expect(without.filter((r) => r.type === 'claim')).toEqual([]);
  const explicitOff = await searchAll(db, 'copper', { includeClaims: false });
  expect(explicitOff.filter((r) => r.type === 'claim')).toEqual([]);
  // Non-claim hits are unaffected by the option.
  const brief = (await searchAll(db, 'term premium')).find((r) => r.type === 'brief');
  const briefMember = (await searchAll(db, 'term premium', { includeClaims: true })).find((r) => r.type === 'brief');
  expect(brief?.href).toBe(briefMember?.href);
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
  await expect(searchAll(db, "o'brien", { includeClaims: true })).resolves.toEqual([]);
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

it('search page hides claim hits from logged-out visitors', async () => {
  const db = await createTestDb();
  await seedAll(db);
  session.member = false;
  const markup = renderToStaticMarkup(
    await SearchPage({ searchParams: Promise.resolve({ q: 'copper' }) }),
  );
  expect(markup).not.toContain('LME copper');
  expect(markup).not.toContain('href="/accountability"');
  expect(markup).not.toContain('claims, research');
});

it('search page shows claim hits to members', async () => {
  const db = await createTestDb();
  await seedAll(db);
  session.member = true;
  const markup = renderToStaticMarkup(
    await SearchPage({ searchParams: Promise.resolve({ q: 'copper' }) }),
  );
  expect(markup).toContain('LME copper');
  expect(markup).toContain('href="/accountability"');
});

it('search page renders a no-results state', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(
    await SearchPage({ searchParams: Promise.resolve({ q: 'zzzznope' }) }),
  );
  expect(markup).toContain('No results for');
});

it('converts stored Pacific and Eastern clocks in brief and research snippets', async () => {
  const db = await createTestDb();
  await upsertBrief(db, {
    date: '2026-09-30',
    kind: 'daily',
    subject: 'PCE day',
    telegram_ping: 'Core PCE prints at 8:30 ET and the tape waits.',
    html: '<p>Core PCE prints at 8:30 ET and the tape waits.</p>',
    sent_verified_at: '2026-09-30T14:00:00Z',
  });
  await upsertResearch(db, {
    date: '2026-08-15',
    topic: 'Morning print',
    finding: 'The release hits at 6:30 a.m. ET and funding is unchanged.',
    changed: 'No change in the standing assumption.',
    decision: 'Hold the map.',
    watch: 'The next payrolls print.',
    citations: [{ url: 'https://www.bls.gov/schedule/news_release/cpi.htm', title: 'BLS calendar' }],
    generated_at: '2026-08-15T07:00:00Z',
  });
  const brief = (await searchAll(db, 'tape waits')).find((hit) => hit.type === 'brief');
  expect(brief?.snippet).toContain('12:30 UTC');
  expect(brief?.snippet).not.toContain('ET');
  const memo = (await searchAll(db, 'funding is unchanged')).find((hit) => hit.type === 'research');
  expect(memo?.snippet).toContain('10:30 UTC');
  expect(memo?.snippet).not.toContain('a.m. ET');
});

it('about is dynamic so the header Updated stamp is not prerendered away', () => {
  expect(aboutDynamic).toBe('force-dynamic');
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
  expect(markup).toContain('at 14:00 UTC');
  expect(markup).toContain('Saturday at 17:00 UTC');
  expect(markup).toContain('Sunday at 23:00 UTC');
  expect(markup).not.toContain('Pacific');
  expect(markup).toContain('not used');
  expect(markup).toContain('Content from paid or licensed sources');
  expect(markup).not.toContain('paraphrased');
  expect(markup).toContain('hit rate counts hits divided by hits plus misses');
});
