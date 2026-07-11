import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: BriefsPage } = await import('@/app/briefs/page');
const { default: BriefPage } = await import('@/app/briefs/[date]/page');

it('archive lists every brief newest-first with weekend labels', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await BriefsPage());
  expect(markup).toContain('href="/briefs/2026-07-11"');
  expect(markup).toContain('href="/briefs/2026-07-09"');
  expect(markup).toContain('href="/briefs/2026-07-08"');
  expect(markup).toContain('Weekend review'); // label on the Saturday brief
  expect(markup.indexOf('2026-07-11')).toBeLessThan(markup.indexOf('2026-07-08')); // newest first
});

it('archive shows an empty state with no briefs', async () => {
  await createTestDb(); // no seed
  const markup = renderToStaticMarkup(await BriefsPage());
  expect(markup).toContain('No briefs yet');
});

it('permalink renders the brief in full', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await BriefPage({ params: Promise.resolve({ date: '2026-07-08' }) }));
  expect(markup).toContain('Front-end repricing meets a heavy auction week');
  expect(markup).toContain('Term premium models'); // deep research section of the html
});

it('permalink 404s for a missing or malformed date', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await expect(BriefPage({ params: Promise.resolve({ date: '1900-01-01' }) })).rejects.toThrow();
  await expect(BriefPage({ params: Promise.resolve({ date: 'not-a-date' }) })).rejects.toThrow();
});

it('pre-2000 sentinel briefs never appear in listings or latest, but permalink still renders', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const { upsertBrief } = await import('@/lib/ingest/briefs');
  await upsertBrief(db, {
    date: '1999-01-01',
    kind: 'daily',
    subject: 'Smoke test brief (sentinel — not market content)',
    telegram_ping: 'sentinel',
    html: '<p>sentinel</p>',
    sent_verified_at: '1999-01-01T00:00:00Z',
  });
  const { getLatestBrief, listBriefs, getBriefByDate } = await import('@/lib/queries/briefs');
  const latest = await getLatestBrief(db);
  expect(latest?.date).not.toBe('1999-01-01');
  const list = await listBriefs(db);
  expect(list.some((b) => b.date === '1999-01-01')).toBe(false);
  const direct = await getBriefByDate(db, '1999-01-01');
  expect(direct?.subject).toContain('sentinel');
});
