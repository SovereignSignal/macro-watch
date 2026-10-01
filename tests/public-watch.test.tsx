import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it } from 'vitest';
import { HomeView } from '@/components/HomeView';
import { MastheadUpdated } from '@/components/MastheadUpdated';
import { panelSnapshots } from '@/db/schema';
import { upsertPanel } from '@/lib/ingest/panels';
import { parsePublishedWatch } from '@/lib/public-watch';
import { createTestDb } from './helpers/db';

const { default: TrackRecordPage } = await import('@/app/track-record/page');

const FULL = {
  updated_at: '2026-09-30T14:14:00Z',
  scoreboard: {
    as_of: '2026-09-30',
    totals: { scored: 8, hit: 5, miss: 3, void: 1, open: 2, hit_rate: 0.625, brier: 0.18 },
    recent: [
      {
        call_id: 'sovs-macro:c-miss',
        title: 'Payrolls miss the consensus',
        made_at: '2026-07-01T12:00:00Z',
        resolved_at: '2026-08-01',
        status: 'miss',
        note: 'The print beat.',
      },
      {
        call_id: 'sovs-macro:c-hit',
        title: '10-year yield closes above 4.5%',
        made_at: '2026-06-01',
        resolved_at: '2026-09-15',
        status: 'hit',
        note: 'Closed at 4.62%.',
        url: 'https://kalshi.com/markets/kxexample',
      },
      {
        call_id: 'ap:c-private',
        title: 'Alpha Picks oil call',
        made_at: '2026-06-02',
        resolved_at: '2026-07-02',
        status: 'hit',
        source: 'ap',
        note: 'Must not render.',
      },
    ],
    open: [
      { call_id: 'sovs-macro:c-open', title: 'Dollar index holds above 100', made_at: '2026-09-01', horizon: '2026-10-31' },
      { call_id: 'sovs-macro:c-vibes', title: 'Quiet tape', made_at: '2026-09-02', horizon: '2026-11-01', publication: 'Market Vibes' },
    ],
  },
  kalshi_movers: {
    as_of: '2026-09-30T14:00:00Z',
    window_hours: 24,
    stale: true,
    items: [
      {
        ticker: 'KXRECESS-26',
        title: 'Recession in 2026',
        url: 'https://kalshi.com/markets/kxrecess',
        prob_now: 0.22,
        prob_prev: 0.3,
        change_pp: -8,
        volume_24h: 8400,
        category: 'Growth',
      },
      {
        ticker: 'KXFED-26OCT',
        title: 'Fed hike in October',
        url: 'https://kalshi.com/markets/kxfed',
        prob_now: 0.41,
        prob_prev: 0.28,
        change_pp: 13,
        change_1h_pp: 2,
        volume_24h: 125000,
        category: 'Rates',
      },
      {
        ticker: 'KXBB',
        title: 'Bloomberg desk market',
        url: 'https://www.bloomberg.com/markets',
        prob_now: 0.5,
        prob_prev: 0.1,
        change_pp: 40,
        volume_24h: 10,
        category: 'News',
      },
    ],
  },
};

beforeEach(async () => {
  await createTestDb();
});

it('parses a full watch payload and drops private items', () => {
  const watch = parsePublishedWatch(FULL);
  expect(watch.updatedAt).toBe('2026-09-30T14:14:00.000Z');
  expect(watch.scoreboard?.totals).toMatchObject({
    scored: 8, hit: 5, miss: 3, voided: 1, open: 2, hitRate: 0.625, brier: 0.18,
  });
  expect(watch.scoreboard?.recent.map((call) => call.callId)).toEqual(['sovs-macro:c-miss', 'sovs-macro:c-hit']);
  expect(watch.scoreboard?.recent[1].url).toBe('https://kalshi.com/markets/kxexample');
  expect(watch.scoreboard?.open.map((call) => call.callId)).toEqual(['sovs-macro:c-open']);
  expect(watch.kalshiMovers?.items[0].change1hPp).toBe(2);
  expect(watch.kalshiMovers?.items[1].change1hPp).toBeNull();
  expect(watch.kalshiMovers?.stale).toBe(true);
  expect(watch.kalshiMovers?.windowHours).toBe(24);
  expect(watch.kalshiMovers?.items.map((item) => item.ticker)).toEqual(['KXFED-26OCT', 'KXRECESS-26']);
});

it('parses a partial payload and leaves the omitted keys empty', () => {
  const watch = parsePublishedWatch({
    scoreboard: {
      totals: { hit: 2, miss: 2, hit_rate: 0.5 },
      recent: [{ call_id: 'sovs-macro:c1', title: 'No link on this call', status: 'void', note: 'Ruled out.' }],
    },
  });
  const nullTotals = parsePublishedWatch({
    scoreboard: { totals: { scored: 0, hit: 0, miss: 0, void: 0, open: 1, hit_rate: null, brier: null } },
  });
  expect(watch.updatedAt).toBeNull();
  expect(watch.kalshiMovers).toBeNull();
  expect(nullTotals.scoreboard?.totals.hitRate).toBeNull();
  expect(nullTotals.scoreboard?.totals.brier).toBeNull();
  expect(nullTotals.scoreboard?.totals.open).toBe(1);
  expect(watch.scoreboard?.totals.brier).toBeNull();
  expect(watch.scoreboard?.totals.scored).toBeNull();
  expect(watch.scoreboard?.totals.open).toBeNull();
  expect(watch.scoreboard?.recent).toEqual([
    expect.objectContaining({ title: 'No link on this call', url: null, status: 'void', note: 'Ruled out.' }),
  ]);
  expect(watch.scoreboard?.open).toEqual([]);
});

it('treats a payload without the new keys as empty', () => {
  expect(parsePublishedWatch({ rows: [{ label: 'ES', value: '1' }] })).toEqual({
    updatedAt: null,
    scoreboard: null,
    kalshiMovers: null,
  });
  expect(parsePublishedWatch(null).scoreboard).toBeNull();
  expect(parsePublishedWatch({ scoreboard: 'nope', kalshi_movers: [], updated_at: 'yesterday' })).toEqual({
    updatedAt: null,
    scoreboard: null,
    kalshiMovers: null,
  });
});

it('reads the boards from the scoreboard panel and the newest updated_at', async () => {
  const db = await createTestDb();
  const { getPublishedWatch } = await import('@/lib/queries/watch');
  await upsertPanel(db, {
    kind: 'dashboard',
    taken_at: '2026-09-30T14:14:00Z',
    payload: {
      rows: [{ label: 'ES', value: '1', change: null }],
      updated_at: FULL.updated_at,
      scoreboard: FULL.scoreboard,
      kalshi_movers: FULL.kalshi_movers,
    },
  });
  const dashboardOnly = await getPublishedWatch(db);
  expect(dashboardOnly.updatedAt).toBe('2026-09-30T14:14:00.000Z');
  expect(dashboardOnly.scoreboard).toBeNull();
  expect(dashboardOnly.kalshiMovers).toBeNull();

  await upsertPanel(db, {
    kind: 'scoreboard',
    taken_at: '2026-09-29T12:00:00Z',
    payload: {
      rows: [{ label: 'Calls', value: '5H-3M (2 open)', note: 'hit rate 0.625', source: 'sovs-macro' }],
      updated_at: '2026-09-29T12:00:00Z',
      scoreboard: FULL.scoreboard,
      kalshi_movers: FULL.kalshi_movers,
    },
  });
  const watch = await getPublishedWatch(db);
  expect(watch.updatedAt).toBe('2026-09-30T14:14:00.000Z');
  expect(watch.scoreboard?.totals.hit).toBe(5);
  expect(watch.kalshiMovers?.items[0].ticker).toBe('KXFED-26OCT');
  const { getLatestPanel } = await import('@/lib/queries/panels');
  const stored = await getLatestPanel(db, 'scoreboard');
  expect((stored?.payload as { rows: { label: string; source: string }[] }).rows[0]).toMatchObject({
    label: 'Calls',
    source: 'sovs-macro',
  });
});

it('renders the track record and the Kalshi board from a full payload', async () => {
  const db = await createTestDb();
  await upsertPanel(db, {
    kind: 'scoreboard',
    taken_at: '2026-09-30T14:14:00Z',
    payload: { rows: [{ label: 'Calls', value: '5H-3M (2 open)', source: 'sovs-macro' }], ...FULL },
  });
  const page = renderToStaticMarkup(await TrackRecordPage());
  expect(page).toContain('62.5% hit rate');
  expect(page).toContain('>5<');
  expect(page).toContain('>3<');
  expect(page).toContain('>1<');
  expect(page).toContain('>2<');
  expect(page).toContain('>8<');
  expect(page).toContain('0.18');
  expect(page).toContain('10-year yield closes above 4.5%');
  expect(page).toContain('href="https://kalshi.com/markets/kxexample"');
  expect(page).toContain('badge-hit');
  expect(page).toContain('>Hit<');
  expect(page).toContain('Closed at 4.62%.');
  expect(page).toContain('Payrolls miss the consensus');
  expect(page).toContain('badge-miss');
  expect(page).toContain('September 15, 2026');
  expect(page).toContain('Dollar index holds above 100');
  expect(page).toContain('October 31, 2026');
  expect(page.toLowerCase()).not.toContain('alpha picks');
  expect(page.toLowerCase()).not.toContain('market vibes');
  expect(page).not.toContain('Must not render');

  const home = renderToStaticMarkup(
    <HomeView brief={null} panel={null} cards={[]} watch={parsePublishedWatch(FULL)} />,
  );
  expect(home).toContain('62.5% hit rate');
  expect(home).toContain('5 hit · 3 miss · 1 void · 2 open');
  expect(home).toContain('Brier 0.18');
  expect(home).toContain('href="/track-record"');
  expect(home).toContain('Biggest odds moves');
  expect(home).toContain('Past 24 hours');
  expect(home).toContain('Stale. These moves are older than the refresh window.');
  expect(home).toContain('chip-unverified');
  expect(home.indexOf('Fed hike in October')).toBeLessThan(home.indexOf('Recession in 2026'));
  expect(home).toContain('28% → 41%');
  expect(home).toContain('30% → 22%');
  expect(home).toContain('change-up');
  expect(home).toContain('+13 pp');
  expect(home).toContain('1 hour');
  expect(home).toContain('+2 pp');
  expect(home).toContain('change-down');
  expect(home).toContain('-8 pp');
  expect(home).toContain('125,000');
  expect(home).toContain('8,400');
  expect(home).toContain('Rates');
  expect(home).toContain('Growth');
  expect(home).toContain('href="https://kalshi.com/markets/kxfed"');
  expect(home).toContain('KXFED-26OCT');
  expect(home.toLowerCase()).not.toContain('bloomberg');
});

it('renders a partial scoreboard without inventing a Brier score or a link', async () => {
  const db = await createTestDb();
  await upsertPanel(db, {
    kind: 'scoreboard',
    taken_at: '2026-09-30T14:14:00Z',
    payload: {
      rows: [{ label: 'Calls', value: '2H-2M', source: 'sovs-macro' }],
      scoreboard: {
        totals: { hit: 2, miss: 2, hit_rate: 0.5 },
        recent: [{ call_id: 'sovs-macro:c1', title: 'No link on this call', status: 'void', note: 'Ruled out.' }],
      },
    },
  });
  const page = renderToStaticMarkup(await TrackRecordPage());
  expect(page).toContain('50% hit rate');
  expect(page).toContain('No link on this call');
  expect(page).toContain('badge-void');
  expect(page).toContain('Ruled out.');
  expect(page).toContain('No open calls.');
  expect(page).not.toContain('Brier');
  expect(page).not.toContain('<a href="https://');
});

it('renders empty states when the payload has none of the new keys', async () => {
  const db = await createTestDb();
  await upsertPanel(db, {
    kind: 'dashboard',
    taken_at: '2026-09-30T12:00:00Z',
    payload: { rows: [{ label: 'ES', value: '1', change: null }] },
  });
  const page = renderToStaticMarkup(await TrackRecordPage());
  expect(page).toContain('No track record yet');
  expect(page).not.toContain('hit rate');
  const home = renderToStaticMarkup(<HomeView brief={null} panel={null} cards={[]} />);
  expect(home).toContain('No public calls yet.');
  expect(home).toContain('No odds moves yet.');
  expect(home).toContain('href="/track-record"');
});

it('still hides a private item that was stored before the ingest filter', async () => {
  const db = await createTestDb();
  await db.insert(panelSnapshots).values({
    kind: 'scoreboard',
    takenAt: new Date('2026-09-30T14:14:00Z'),
    payload: {
      rows: [{ label: 'Calls', value: '1H-0M', source: 'sovs-macro' }],
      scoreboard: {
        totals: { hit: 1, miss: 0, hit_rate: 1 },
        recent: [
          { call_id: 'sovs-macro:clean', title: 'Public call', status: 'hit' },
          { call_id: 'ap:leak', title: 'AP Research call', status: 'hit', source: 'AP Research', note: 'secret desk' },
        ],
      },
      kalshi_movers: {
        items: [{ ticker: 'KXECON', title: 'Economist special', publication: 'The Economist', prob_now: 0.2, prob_prev: 0.1, change_pp: 10 }],
      },
    },
  });
  const page = renderToStaticMarkup(await TrackRecordPage());
  expect(page).toContain('Public call');
  expect(page.toLowerCase()).not.toContain('ap research');
  expect(page).not.toContain('secret desk');
  const { getPublishedWatch } = await import('@/lib/queries/watch');
  const home = renderToStaticMarkup(
    <HomeView brief={null} panel={null} cards={[]} watch={await getPublishedWatch(db)} />,
  );
  expect(home).toContain('No markets moved in this window.');
  expect(home.toLowerCase()).not.toContain('economist');
});

it('shows one Updated stamp from updated_at in Pacific time, and falls back when it is missing', async () => {
  const db = await createTestDb();
  await upsertPanel(db, {
    kind: 'dashboard',
    taken_at: '2026-09-30T12:00:00Z',
    payload: { rows: [], updated_at: '2026-09-30T14:14:00Z' },
  });
  const header = renderToStaticMarkup(await MastheadUpdated());
  expect(header).toContain('Updated 30 Sep 07:14 PDT');
  expect(header).toContain('dateTime="2026-09-30T14:14:00.000Z"');
  expect(header.match(/<time\b/g)).toHaveLength(1);

  await upsertPanel(db, {
    kind: 'dashboard',
    taken_at: '2026-09-30T15:00:00Z',
    payload: { rows: [{ label: 'ES', value: '1' }] },
  });
  const fallback = renderToStaticMarkup(await MastheadUpdated());
  expect(fallback).toContain('updated 30 Sep 08:00 PDT');
  expect(fallback).toContain('dateTime="2026-09-30T15:00:00.000Z"');
});
