import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { panelSnapshots } from '@/db/schema';
import { createTestDb } from './helpers/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST } = await import('@/app/api/ingest/panels/route');

const TOKEN = 'test-token';

function post(body: unknown, token: string | null = TOKEN): Request {
  return new Request('http://localhost/api/ingest/panels', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const DASHBOARD = {
  kind: 'dashboard',
  taken_at: '2026-07-11T12:00:00Z',
  payload: { as_of: '2026-07-11', rows: [{ label: 'ES', value: '6,412.50', change: '+0.4%' }] },
};

let db: Db;

beforeEach(async () => {
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  db = await createTestDb();
});

it('rejects without a token', async () => {
  expect((await POST(post(DASHBOARD, null))).status).toBe(401);
});

it('rejects an unknown panel kind with 422', async () => {
  expect((await POST(post({ ...DASHBOARD, kind: 'heatmap' }))).status).toBe(422);
});

it('upserts idempotently on kind + taken_at', async () => {
  const res = await POST(post(DASHBOARD));
  expect(await res.json()).toEqual({ ok: true, upserted: 1, revalidated: ['/', '/track-record'] });
  await POST(post({ ...DASHBOARD, payload: { rows: [] } }));
  const rows = await db.select().from(panelSnapshots);
  expect(rows).toHaveLength(1);
  expect(rows[0].payload).toEqual({ rows: [] });
});

it('different kinds at the same instant coexist (time-series per kind)', async () => {
  await POST(post(DASHBOARD));
  await POST(post({ ...DASHBOARD, kind: 'odds_lens' }));
  await POST(post({ ...DASHBOARD, taken_at: '2026-07-11T12:15:00Z' }));
  expect(await db.select().from(panelSnapshots)).toHaveLength(3);
});

it('stores watch keys inside the scoreboard payload and keeps rows', async () => {
  const rows = [{ label: 'Calls', value: '1H-0M (1 open)', note: 'hit rate 1', source: 'sovs-macro' }];
  const ignored = await POST(post({
    kind: 'scoreboard',
    taken_at: '2026-09-30T14:00:00Z',
    updated_at: '2026-09-30T14:00:00Z',
    scoreboard: { totals: { hit: 9 } },
    payload: { rows },
  }));
  expect(ignored.status).toBe(200);
  const beside = (await db.select().from(panelSnapshots))[0].payload as Record<string, unknown>;
  expect(beside.rows).toEqual(rows);
  expect(beside.scoreboard).toBeUndefined();
  expect(beside.updated_at).toBeUndefined();

  const res = await POST(post({
    kind: 'scoreboard',
    taken_at: '2026-09-30T14:14:00Z',
    payload: {
      updated_at: '2026-09-30T14:14:00Z',
      rows,
      scoreboard: {
        totals: { hit: 1, miss: 0, hit_rate: 1, brier: null },
        recent: [
          { call_id: 'sovs-macro:keep', title: 'Public call', status: 'hit', source: 'sovs-macro' },
          { call_id: 'ap:drop', title: 'Oil under 70', status: 'miss', source: 'ap' },
          { call_id: 'sovs-macro:alyosha', title: 'Dollar breaks', status: 'hit', publication: 'Alyosha' },
        ],
      },
      kalshi_movers: {
        window_hours: 24,
        stale: false,
        items: [
          { ticker: 'KXOK', title: 'Fed hike', prob_now: 0.4, prob_prev: 0.2, change_pp: 20, change_1h_pp: 2 },
          { ticker: 'KXNO', title: 'The Economist market', url: 'https://www.economist.com/markets', prob_now: 0.5, prob_prev: 0.4, change_pp: 10 },
        ],
      },
    },
  }));
  expect(res.status).toBe(200);
  const stored = (await db.select().from(panelSnapshots)).find((row) => row.takenAt.toISOString().startsWith('2026-09-30T14:14'));
  const payload = stored?.payload as {
    rows: typeof rows;
    updated_at: string;
    scoreboard: { recent: { call_id: string }[] };
    kalshi_movers: { items: { ticker: string }[]; stale: boolean };
  };
  expect(payload.rows).toEqual(rows);
  expect(payload.updated_at).toBe('2026-09-30T14:14:00Z');
  expect(payload.scoreboard.recent.map((item) => item.call_id)).toEqual(['sovs-macro:keep']);
  expect(JSON.stringify(payload).toLowerCase()).not.toMatch(/alyosha|economist/);
  expect(payload.kalshi_movers.items.map((item) => item.ticker)).toEqual(['KXOK']);
  expect(payload.kalshi_movers.stale).toBe(false);
});

it('scoreboard snapshots revalidate the accountability page', async () => {
  const res = await POST(post({ ...DASHBOARD, kind: 'scoreboard' }));
  expect((await res.json()).revalidated).toEqual(['/', '/track-record', '/accountability']);
});
