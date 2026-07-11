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
