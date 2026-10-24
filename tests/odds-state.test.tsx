import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { HomeView } from '@/components/HomeView';
import { panelSnapshots } from '@/db/schema';
import { upsertPanel } from '@/lib/ingest/panels';
import { oddsLensState } from '@/lib/odds-state';
import { panelView } from '@/lib/panel-contract';
import { getLatestVerifiedPanel, getOddsLensState, ODDS_MAX_AGE_MS } from '@/lib/queries/panels';
import { getPublishedWatch, oddsRefreshedPayload } from '@/lib/queries/watch';
import { createTestDb } from './helpers/db';

// Synthetic fixtures. Shapes mirror the pipeline's odds_lens contract.
const verifiedPayload = (extra: Record<string, unknown> = {}) => ({
  source_schema_version: 2,
  source_sha256: 'c'.repeat(64),
  source_count: 10,
  selected_count: 1,
  rows: [{ label: 'Rate cut at next meeting', value: 'Yes 40%', change: '+$5K net (24h)' }],
  ...extra,
});
const NOW = new Date('2026-10-24T15:00:00Z');
const at = (iso: string) => new Date(iso);

function verified(iso: string, extra: Record<string, unknown> = {}) {
  const payload = verifiedPayload(extra);
  return { takenAt: at(iso), payload, view: panelView(payload) };
}

it('fresh verified odds render rows', () => {
  const state = oddsLensState({ latest: null, verified: verified('2026-10-24T13:00:00Z'), now: NOW, maxAgeMs: ODDS_MAX_AGE_MS });
  expect(state.status).toBe('fresh');
  expect(state.rows).toHaveLength(1);
  expect(state.summary).toBe('1 markets from 10 tracked-wallet signals');
});

it('expired odds become stale with no probabilities', () => {
  const state = oddsLensState({ latest: null, verified: verified('2026-10-02T13:23:23Z'), now: NOW, maxAgeMs: ODDS_MAX_AGE_MS });
  expect(state.status).toBe('stale');
  expect(state.rows).toEqual([]);
  expect(state.summary).toBeNull();
  expect(state.message).toContain('2 Oct 13:23 UTC');
});

it('producer-marked stale odds are not shown even inside the window', () => {
  const state = oddsLensState({
    latest: null, verified: verified('2026-10-24T13:00:00Z', { status: 'stale' }), now: NOW, maxAgeMs: ODDS_MAX_AGE_MS,
  });
  expect(state.status).toBe('stale');
  expect(state.rows).toEqual([]);
});

it('a newer explicit unavailable post supersedes older verified odds', () => {
  const state = oddsLensState({
    latest: { takenAt: at('2026-10-24T14:00:00Z'), payload: { rows: [], status: 'unavailable' } },
    verified: verified('2026-10-24T13:00:00Z'),
    now: NOW,
    maxAgeMs: ODDS_MAX_AGE_MS,
  });
  expect(state.status).toBe('unavailable');
  expect(state.rows).toEqual([]);
  expect(state.message).toContain('Last verified odds: 24 Oct 13:00 UTC');
});

it('nothing verified is unavailable', () => {
  const state = oddsLensState({ latest: null, verified: null, now: NOW, maxAgeMs: ODDS_MAX_AGE_MS });
  expect(state).toMatchObject({ status: 'unavailable', rows: [], observedAt: null });
});

it('getLatestVerifiedPanel honours notBefore instead of walking back forever', async () => {
  const db = await createTestDb();
  await db.insert(panelSnapshots).values([
    { kind: 'odds_lens', takenAt: at('2026-10-02T13:23:23Z'), payload: verifiedPayload() },
    // Live failure mode: newer posts missing source_schema_version.
    { kind: 'odds_lens', takenAt: at('2026-10-24T13:04:00Z'), payload: verifiedPayload({ source_schema_version: undefined }) },
  ]);
  expect((await getLatestVerifiedPanel(db, 'odds_lens'))?.takenAt.toISOString()).toBe('2026-10-02T13:23:23.000Z');
  expect(await getLatestVerifiedPanel(db, 'odds_lens', { notBefore: at('2026-10-17T00:00:00Z') })).toBeNull();
  const state = await getOddsLensState(db, NOW);
  expect(state.status).toBe('unavailable');
  expect(state.rows).toEqual([]);
});

it('getOddsLensState reports stale inside the lookback and fresh when current', async () => {
  const db = await createTestDb();
  await db.insert(panelSnapshots).values({ kind: 'odds_lens', takenAt: at('2026-10-23T12:00:00Z'), payload: verifiedPayload() });
  expect((await getOddsLensState(db, NOW)).status).toBe('stale');
  await db.insert(panelSnapshots).values({ kind: 'odds_lens', takenAt: at('2026-10-24T13:04:00Z'), payload: verifiedPayload() });
  expect((await getOddsLensState(db, NOW)).status).toBe('fresh');
});

it('home view renders stale and unavailable states without odds', () => {
  for (const status of ['stale', 'unavailable'] as const) {
    const markup = renderToStaticMarkup(
      <HomeView
        brief={null}
        panel={null}
        oddsPanel={{
          takenAt: '2026-10-02T13:23:23Z',
          rows: [{ label: 'Rate cut at next meeting', value: 'Yes 40%', change: null, note: null }],
          summary: 'x',
          status,
          message: 'Odds last verified 2 Oct 13:23 UTC. Not shown: older than 6 hours.',
        }}
        cards={[]}
        member
      />,
    );
    expect(markup).toContain(`data-odds-status="${status}"`);
    expect(markup).toContain('Odds last verified 2 Oct 13:23 UTC');
    expect(markup).not.toContain('Yes 40%');
    expect(markup).not.toContain('Rate cut at next meeting');
  }
});

it('masthead stamp ignores odds posts that did not refresh the odds', async () => {
  expect(oddsRefreshedPayload(verifiedPayload())).toBe(true);
  expect(oddsRefreshedPayload(verifiedPayload({ source_schema_version: undefined }))).toBe(false);
  expect(oddsRefreshedPayload({ rows: [], status: 'unavailable' })).toBe(false);
  expect(oddsRefreshedPayload(verifiedPayload({ status: 'stale' }))).toBe(false);

  const db = await createTestDb();
  await upsertPanel(db, {
    kind: 'dashboard', taken_at: '2026-10-24T13:00:00Z',
    payload: { rows: [{ label: 'ES', value: '1' }], updated_at: '2026-10-24T13:00:00Z' },
  });
  await upsertPanel(db, {
    kind: 'odds_lens', taken_at: '2026-10-24T14:07:00Z',
    payload: { ...verifiedPayload({ source_schema_version: undefined }), updated_at: '2026-10-24T14:07:00Z' },
  });
  expect((await getPublishedWatch(db)).updatedAt).toBe('2026-10-24T13:00:00.000Z');
  await upsertPanel(db, {
    kind: 'odds_lens', taken_at: '2026-10-24T14:30:00Z',
    payload: { ...verifiedPayload(), updated_at: '2026-10-24T14:30:00Z' },
  });
  expect((await getPublishedWatch(db)).updatedAt).toBe('2026-10-24T14:30:00.000Z');
});
