import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { upsertThemeState } from '@/lib/ingest/themes';
import { getThemeDetail } from '@/lib/queries/map';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: MapPage } = await import('@/app/map/page');
const { default: ThemePage, generateMetadata } = await import('@/app/map/[theme]/page');

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
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
  const markup = renderToStaticMarkup(await MapPage());
  vi.useRealTimers();
  expect(markup).toContain('Theme map');
  expect(markup).toContain('Rate-path repricing');
  expect(markup).toContain('expected path of policy rates');
  expect(markup).toContain('Dollar downtrend');
  expect(markup).toContain('Retired'); // section for china-reflation
  expect(markup).toContain('China reflation');
  expect(markup).toContain('conv-high');
  expect(markup).toContain('updating');
  // Trigger rows on cards: name + freshness chip (instrument-panel layout).
  expect(markup).toContain('2y auction demand');
  expect(markup).toContain('chip-live');
  expect(markup).toContain('Summary basis updated · supports · confidence raised · live');
  expect(markup).toContain('Summary basis repeated · challenges · confidence lowered · stale');
  expect(markup).toContain('Summary basis repeated · mixed evidence · confidence invalidated · archived');
  expect(markup).toContain('Evidence health');
  expect(markup).toContain('evidence-health-live');
  expect(markup).toContain('<dt>Live</dt><dd>1</dd>');
  expect(markup).toContain('<dt>Stale</dt><dd>1</dd>');
  expect(markup).toContain('<dt>Retire review</dt><dd>0</dd>');
  expect(markup).toContain('<dt>Date errors</dt><dd>0</dd>');
  expect(markup).toContain('<dt>Archived</dt><dd>1</dd>');
});

it('/map renders an empty state with no data', async () => {
  await createTestDb();
  const markup = renderToStaticMarkup(await MapPage());
  expect(markup).toContain('No themes yet.');
  expect(markup).not.toContain('The field'); // no broken hero either
});

it('/map renders the field hero above the grid, nodes linked to dossiers', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await MapPage());
  expect(markup).toContain('Position map');
  expect(markup).toContain('← easing · pressure · building →');
  expect(markup).toContain('field-node');
  expect(markup).toContain('href="/map/rate-path-repricing"'); // SVG node link
  expect(markup).toContain('RETIRED'); // china-reflation pins to the shelf
  expect(markup.indexOf('the-field')).toBeLessThan(markup.indexOf('theme-grid'));
});

it('/map/[theme] renders the full dossier with brief-linked timeline', async () => {
  const db = await createTestDb();
  await seedAll(db);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
  const markup = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'rate-path-repricing' }) }),
  );
  vi.useRealTimers();
  expect(markup).toContain('Rate-path repricing');
  expect(markup).toContain('expected path of policy rates');
  expect(markup).toContain('underpricing how slow the cutting cycle gets');
  expect(markup).toContain('Core CPI re-accelerates above 0.3% m/m'); // raise condition
  expect(markup).toContain('href="/briefs/2026-07-08"'); // event linked to source brief
  expect(markup).toContain('dir-raise');
  expect(markup).toContain('dir-candidate');
  expect(markup).toContain('2y UST closes above 4.40%'); // related claim
  expect(markup).toContain('Two snapshots are needed.'); // 1 snapshot only
  expect(markup).toContain('Evidence check');
  expect(markup).toContain('Payrolls beat and the front end repriced');
  expect(markup).toContain('Supporting');
  expect(markup).toContain('Summary basis updated');
  expect(markup).toContain('Raised');
  expect(markup).toContain('July 8, 2026');
  expect(markup).not.toContain('Repeat count');
  expect(markup).toContain('2026-07-15 CPI');
});

it('/map/[theme] renders repeated challenging evidence and an explicit stale warning', async () => {
  const db = await createTestDb();
  await seedAll(db);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
  const markup = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'dollar-downtrend' }) }),
  );
  vi.useRealTimers();
  expect(markup).toContain('Challenging');
  expect(markup).toContain('Summary basis repeated');
  expect(markup).toContain('Lowered');
  expect(markup).toContain('Repeat count');
  expect(markup).toContain('2 consecutive repeated deliveries');
  expect(markup).toContain('Summary basis is stale: it has not changed for 15 days.');
  expect(markup).toContain('badge-active');
});

it('/map/[theme] archives retired evidence without a stale warning or status mutation', async () => {
  const db = await createTestDb();
  await seedAll(db);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
  const markup = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'china-reflation' }) }),
  );
  vi.useRealTimers();
  expect(markup).toContain('Mixed');
  expect(markup).toContain('Invalidated');
  expect(markup).toContain('Archived theme. Freshness monitoring is paused.');
  expect(markup).not.toContain('Summary basis is stale');
  expect(markup).not.toContain('Retire review due');
  expect(markup).toContain('badge-retired');
});

it('/map/[theme] renders retire-review warning for an active theme without changing status', async () => {
  const db = await createTestDb();
  await seedAll(db);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-01T12:00:00Z'));
  const markup = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'rate-path-repricing' }) }),
  );
  vi.useRealTimers();
  expect(markup).toContain('Retire review due: the summary basis has not changed for 24 days.');
  expect(markup).toContain('Silence has not changed its lifecycle status.');
  expect(markup).toContain('badge-active');
});

it('/map/[theme] warns on a future basis date while honoring snapshot status', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await upsertThemeState(db, {
    taken_at: '2026-07-16T12:10:00Z',
    payload: {
      themes: [{
        slug: 'rate-path-repricing',
        name: 'Rate-path repricing',
        status: 'candidate',
        evidence: 'A future-dated assessment was delivered.',
        evidence_lifecycle: {
          version: 1,
          basis_novelty: 'updated',
          balance: 'emerging',
          confidence_change: 'candidate',
          last_basis_change_date: '2026-07-17',
          repeat_count: 0,
        },
        last_seen: '2026-07-17',
        next_check: 'Recheck delivery date',
      }],
    },
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-16T12:00:00Z'));
  const markup = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'rate-path-repricing' }) }),
  );
  vi.useRealTimers();
  expect(markup).toContain('Date error: the delivered summary basis change date is in the future.');
  expect(markup).toContain('Lifecycle status is unchanged.');
  expect(markup).toContain('badge-candidate');
  expect(markup).not.toMatch(/source_urls|history|hash/);
});

it('/map and /map/[theme] render the explicit unassessed state for legacy snapshots', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await upsertThemeState(db, {
    taken_at: '2026-07-16T12:10:00Z',
    payload: { themes: [{ slug: 'rate-path-repricing', name: 'Rate-path repricing' }] },
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-16T12:00:00Z'));
  const mapMarkup = renderToStaticMarkup(await MapPage());
  const dossierMarkup = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'rate-path-repricing' }) }),
  );
  vi.useRealTimers();
  expect(mapMarkup).toContain('No delivered evidence assessment yet.');
  expect(dossierMarkup).toContain('Evidence check');
  expect(dossierMarkup).toContain('No delivered evidence assessment yet.');
});

it('/map/[theme] publishes its own canonical and Open Graph URL', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const metadata = await generateMetadata({
    params: Promise.resolve({ theme: 'rate-path-repricing' }),
  });
  expect(metadata.alternates?.canonical).toBe('/map/rate-path-repricing');
  expect(metadata.openGraph?.url).toBe('/map/rate-path-repricing');
});

it('/map/[theme] 404s for an unknown slug', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await expect(ThemePage({ params: Promise.resolve({ theme: 'nope' }) })).rejects.toThrow();
});
