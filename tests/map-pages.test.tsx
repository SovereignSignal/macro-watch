import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { upsertThemeState } from '@/lib/ingest/themes';
import { getThemeDetail } from '@/lib/queries/map';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: MapPage } = await import('@/app/map/page');
const { default: ThemePage } = await import('@/app/map/[theme]/page');

it('getThemeDetail assembles card, timeline, related claims, conviction series', async () => {
  const db = await createTestDb();
  await seedAll(db);
  // Second, earlier snapshot so the conviction series has two points.
  await upsertThemeState(db, {
    taken_at: '2026-07-04T12:10:00Z',
    payload: {
      themes: [
        { slug: 'rate-path-repricing', name: 'Rate-path repricing', conviction: 'medium' },
      ],
    },
  });
  const detail = await getThemeDetail(db, 'rate-path-repricing');
  expect(detail).not.toBeNull();
  expect(detail?.name).toBe('Rate-path repricing');
  expect(detail?.status).toBe('active');
  expect(detail?.events.map((e) => e.eventId)).toEqual([
    'te-2026-07-08-rate-path-1',
    'te-2026-06-24-rate-path-1',
    'te-2026-06-20-rate-path-1',
  ]); // newest first
  expect(detail?.relatedClaims.map((c) => c.claimId).sort()).toEqual([
    'cl-2026-06-05-rates-2',
    'cl-2026-06-24-rates-1',
  ]);
  expect(detail?.conviction).toEqual([
    { takenAt: '2026-07-04T12:10:00.000Z', level: 2 },
    { takenAt: '2026-07-11T12:10:00.000Z', level: 3 },
  ]); // chronological
});

it('getThemeDetail returns null for an unknown slug', async () => {
  const db = await createTestDb();
  await seedAll(db);
  expect(await getThemeDetail(db, 'no-such-theme')).toBeNull();
});

it('/map renders the grid grouped by lifecycle with a freshness badge', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await MapPage());
  expect(markup).toContain('Living theme map');
  expect(markup).toContain('Rate-path repricing');
  expect(markup).toContain('Dollar downtrend');
  expect(markup).toContain('Retired'); // section for china-reflation
  expect(markup).toContain('China reflation');
  expect(markup).toContain('conv-high');
  expect(markup).toContain('updated —');
  // Trigger rows on cards: name + freshness chip (instrument-panel layout).
  expect(markup).toContain('2y auction demand');
  expect(markup).toContain('chip-live');
});

it('/map renders an empty state with no data', async () => {
  await createTestDb();
  const markup = renderToStaticMarkup(await MapPage());
  expect(markup).toContain('No themes on the map yet');
});

it('/map/[theme] renders the full dossier with brief-linked timeline', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'rate-path-repricing' }) }),
  );
  expect(markup).toContain('Rate-path repricing');
  expect(markup).toContain('underpricing how slow the cutting cycle gets');
  expect(markup).toContain('Core CPI re-accelerates above 0.3% m/m'); // raise condition
  expect(markup).toContain('href="/briefs/2026-07-08"'); // event linked to source brief
  expect(markup).toContain('dir-raise');
  expect(markup).toContain('dir-candidate');
  expect(markup).toContain('2y UST closes above 4.40%'); // related claim
  expect(markup).toContain('Not enough history to chart conviction yet'); // 1 snapshot only
});

it('/map/[theme] 404s for an unknown slug', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await expect(ThemePage({ params: Promise.resolve({ theme: 'nope' }) })).rejects.toThrow();
});
