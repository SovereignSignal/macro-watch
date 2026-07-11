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
  expect(await res.json()).toEqual({ ok: true, upserted: 1, revalidated: ['/'] });
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

it('scoreboard snapshots revalidate the accountability page', async () => {
  const res = await POST(post({ ...DASHBOARD, kind: 'scoreboard' }));
  expect((await res.json()).revalidated).toEqual(['/accountability']);
});
