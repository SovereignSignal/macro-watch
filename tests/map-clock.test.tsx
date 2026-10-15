import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { upsertThemeEvents, upsertThemeState } from '@/lib/ingest/themes';
import { getMapClock, getThemeMapCards, mapClockOf } from '@/lib/queries/map';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';


vi.mock('@/lib/member-session', () => ({ isMember: async () => false }));

const { default: MapPage } = await import('@/app/map/page');

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

it('mapClockOf reads last_event_date and rejects anything else', () => {
  expect(mapClockOf({ last_event_date: '2026-09-04' })).toBe('2026-09-04');
  expect(mapClockOf({ last_event_date: 'yesterday' })).toBeNull();
  expect(mapClockOf({})).toBeNull();
  expect(mapClockOf(null)).toBeNull();
});

it('the map runs on the pipeline clock: a candidate 54 days old by the wall clock, 44 by the map, stays a candidate', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const clock = daysAgo(10);
  await upsertThemeEvents(db, [
    {
      event_id: 'te-clock-1',
      date: daysAgo(54),
      theme_slug: 'clock-test',
      theme_name: 'Clock test',
      direction: 'candidate',
      evidence: 'A candidate raised 54 days before today.',
      trigger_state: 'partial',
      next_check: null,
      source: 'daily',
    },
  ]);
  await upsertThemeState(db, {
    taken_at: new Date().toISOString(),
    payload: {
      last_event_date: clock,
      themes: [{ slug: 'clock-test', name: 'Clock test', description: 'Tracks the clock.' }],
    },
  });
  expect(await getMapClock(db)).toBe(clock);
  const { asOf } = await getThemeMapCards(db);
  expect(asOf).toBe(clock);
  const markup = renderToStaticMarkup(await MapPage());
  // the field map links the theme first; the grid card is the <h3> link
  const start = markup.indexOf('<h3><a href="/map/clock-test">');
  expect(start).toBeGreaterThan(-1);
  const li = markup.slice(start, markup.indexOf('</li>', start));
  expect(li).toContain('badge badge-candidate');
  expect(li).not.toContain('badge-dormant');
});

it('without a clock in the snapshot the page falls back to today', async () => {
  const db = await createTestDb();
  await seedAll(db);
  expect(await getMapClock(db)).toBeNull();
  const markup = renderToStaticMarkup(await MapPage());
  expect(markup).toContain('Theme map');
});
