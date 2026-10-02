import { expect, it } from 'vitest';
import { panelSnapshots } from '@/db/schema';
import { panelCoverage, panelRows } from '@/lib/panel-contract';
import { getLatestBrief } from '@/lib/queries/briefs';
import { getThemeMapCards } from '@/lib/queries/map';
import { getLatestPanel, getLatestVerifiedPanel } from '@/lib/queries/panels';
import { safeQuery } from '@/lib/safe';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

it('safeQuery returns the fallback when the query throws', async () => {
  const result = await safeQuery(async () => {
    throw new Error('connection refused');
  }, 'fallback');
  expect(result).toBe('fallback');
});

it('panelRows extracts rows defensively from unknown payloads', () => {
  expect(panelRows(null)).toEqual([]);
  expect(panelRows({ nope: true })).toEqual([]);
  expect(panelRows({ rows: [{ label: 'ES', value: '6,412.50', change: '+0.4%' }, { junk: 1 }, { label: 'N', value: 42 }] })).toEqual([
    { label: 'ES', value: '6,412.50', change: '+0.4%', note: null },
    { label: 'N', value: '42', change: null, note: null },
  ]);
  expect(panelRows({
    rows: [{ label: '2y UST', value: '4.92%', change_1d: '+11bp', change_1w: 15, note: null }],
  })).toEqual([
    { label: '2y UST', value: '4.92%', change: null, note: null, change1d: '+11bp', change1w: '+15' },
  ]);
  expect(panelRows({
    rows: [{ label: 'HY Spread (OAS)', value: '3.02', change_1d: { bad: true } }],
  })).toEqual([
    { label: 'HY Spread (OAS)', value: '3.02', change: null, note: null },
  ]);
  expect(panelRows({
    rows: [
      { label: 'ES', value: '6412', as_of: '2026-10-01T14:14:00Z', quote_kind: 'intraday' },
      { label: '2y UST', value: '4.89%', as_of: '2026-09-29', kind: 'close' },
      { label: 'DXY', value: '99.1', as_of: 'nope' },
    ],
  })).toEqual([
    { label: 'ES', value: '6412', change: null, note: null, asOf: '2026-10-01T14:14:00.000Z', quoteKind: 'intraday' },
    { label: '2y UST', value: '4.89%', change: null, note: null, asOf: '2026-09-29', quoteKind: 'close' },
    { label: 'DXY', value: '99.1', change: null, note: null },
  ]);
});

it('panelCoverage exposes only atomically verified source counts', () => {
  const valid = {
    source_count: 28,
    selected_count: 2,
    source_schema_version: 2,
    source_sha256: 'a'.repeat(64),
    rows: [
      { label: 'Fed', value: 'Yes 42%' },
      { label: 'Iran', value: 'No 74%' },
    ],
  };
  const coverage = panelCoverage(valid);
  expect(coverage).toBe('2 markets from 28 tracked-wallet signals');
  expect(coverage).not.toMatch(/schema|\bv2\b|AMS/i);
  expect(panelCoverage({ ...valid, source_schema_version: 1 })).toBeNull();
  expect(panelCoverage({ ...valid, source_sha256: 'not-a-hash' })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 8 })).toBeNull();
  expect(panelCoverage({ ...valid, source_count: 1 })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 2, rows: [valid.rows[0], valid.rows[0]] })).toBeNull();
  expect(panelCoverage({ ...valid, source_count: Number.MAX_SAFE_INTEGER + 1 })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 0, rows: undefined })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 0, rows: 'not-an-array' })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 0, rows: [{ junk: true }] })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 1, rows: [valid.rows[0], { junk: true }] })).toBeNull();
});

it('getLatestBrief returns the newest brief by date', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const brief = await getLatestBrief(db);
  expect(brief?.date).toBe('2026-07-11');
  expect(brief?.kind).toBe('weekend');
});

it('getLatestPanel returns the newest snapshot of a kind', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const panel = await getLatestPanel(db, 'dashboard');
  expect(panel).not.toBeNull();
  expect(panelRows(panel?.payload)[0]).toEqual({ label: 'ES', value: '6,412.50', change: '+0.4%', note: null });
});

it('getLatestVerifiedPanel paginates past twenty newer legacy odds rows', async () => {
  const db = await createTestDb();
  const validPayload = {
    source_count: 28,
    selected_count: 2,
    source_schema_version: 2,
    source_sha256: 'b'.repeat(64),
    rows: [
      { label: 'Iran invasion', value: 'No 72%', change: '+$35K net (24h)' },
      { label: 'Taiwan conflict', value: 'No 96%', change: '-$359 net (24h)' },
    ],
  };
  await db.insert(panelSnapshots).values([
    {
      kind: 'odds_lens',
      takenAt: new Date('2026-07-21T16:20:12Z'),
      payload: validPayload,
    },
    ...Array.from({ length: 20 }, (_, index) => ({
      kind: 'odds_lens' as const,
      takenAt: new Date(Date.UTC(2026, 6, 21, 20, index, 0)),
      payload: { rows: [{ label: `Legacy row ${index}`, value: 0.725 }] },
    })),
  ]);

  const panel = await getLatestVerifiedPanel(db, 'odds_lens');
  expect(panel?.takenAt.toISOString()).toBe('2026-07-21T16:20:12.000Z');
  expect(panel?.view.coverage).toBe('2 markets from 28 tracked-wallet signals');
  expect(panel?.view.coverage).not.toMatch(/schema|\bv2\b|AMS/i);
  expect(panel?.view.rows.map((row) => row.change)).toEqual(['+$35K net (24h)', '-$359 net (24h)']);
});

it('getLatestVerifiedPanel returns null when recent odds rows are all unverified', async () => {
  const db = await createTestDb();
  await db.insert(panelSnapshots).values({
    kind: 'odds_lens',
    takenAt: new Date('2026-07-21T20:56:00Z'),
    payload: { rows: [{ label: 'Legacy row', value: 0.725 }] },
  });
  expect(await getLatestVerifiedPanel(db, 'odds_lens')).toBeNull();
});

it('getThemeMapCards merges themes rows with the latest state snapshot', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const { takenAt, cards } = await getThemeMapCards(db);
  expect(takenAt?.toISOString()).toBe('2026-07-11T12:10:00.000Z');
  expect(cards.map((c) => c.slug)).toEqual(['rate-path-repricing', 'dollar-downtrend', 'china-reflation']);
  const rate = cards[0];
  expect(rate.status).toBe('active');
  expect(rate.conviction).toBe('high');
  expect(rate.description).toContain('expected path of policy rates');
  expect(rate.read).toContain('underpricing');
  expect(rate.triggers).toEqual([
    { name: '2y auction demand', state: 'live' },
    { name: 'July CPI', state: 'pending' },
  ]);
  const dollar = cards[1];
  expect(dollar.raiseConditions).toEqual(['ECB holds while the Fed blinks']); // string normalized to list
  expect(cards[2].status).toBe('retired');
});
