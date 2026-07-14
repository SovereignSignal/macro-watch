import { expect, it } from 'vitest';
import { panelRows } from '@/lib/panel-contract';
import { getLatestBrief } from '@/lib/queries/briefs';
import { getThemeMapCards } from '@/lib/queries/map';
import { getLatestPanel } from '@/lib/queries/panels';
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
