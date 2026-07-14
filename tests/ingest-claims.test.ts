import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { claims, forwardEvents } from '@/db/schema';
import { createTestDb } from './helpers/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST: postClaims } = await import('@/app/api/ingest/claims/route');
const { POST: postForward } = await import('@/app/api/ingest/forward-events/route');

const TOKEN = 'test-token';

function post(path: string, body: unknown, token: string | null = TOKEN): Request {
  return new Request(`http://localhost/api/ingest/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

// Status vocabulary is the sovs-macro pipeline's, exactly:
// pending | hit | miss | partial | expired | judgment-required | void
const CLAIM = {
  claim_id: 'cl-2026-06-24-rates-1',
  kind: 'map',
  themes: ['rate-path-repricing'],
  predicate: '2y UST closes above 4.40% before 2026-08-01',
  data_anchor: 'UST 2y daily close',
  market_type: 'rates',
  observable_score: 3,
  narrative_score: 1,
  geo_score: 0,
  opened_at: '2026-06-24',
  expires_at: '2026-08-01',
  status: 'pending',
};

const FORWARD = {
  event_id: 'fe-2026-07-15-us-cpi',
  date: '2026-07-15',
  event: 'US CPI (June)',
  expectation: 'Core +0.28% m/m consensus; shelter still the swing factor.',
  surprise: 'A 0.4%+ core print would force the slow-cut repricing to accelerate.',
};

let db: Db;

beforeEach(async () => {
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  db = await createTestDb();
});

it('rejects both endpoints without a token', async () => {
  expect((await postClaims(post('claims', CLAIM, null))).status).toBe(401);
  expect((await postForward(post('forward-events', FORWARD, null))).status).toBe(401);
});

it('rejects an unknown claim status with 422', async () => {
  expect((await postClaims(post('claims', { ...CLAIM, status: 'maybe' }))).status).toBe(422);
});

it('upserts a claim with quality fields in the payload', async () => {
  const res = await postClaims(post('claims', CLAIM));
  expect(await res.json()).toEqual({ ok: true, upserted: 1, revalidated: ['/accountability', '/map'] });
  const [row] = await db.select().from(claims);
  expect(row.claimId).toBe('cl-2026-06-24-rates-1');
  expect(row.themes).toEqual(['rate-path-repricing']);
  expect(row.status).toBe('pending');
  expect((row.payload as Record<string, unknown>).market_type).toBe('rates');
  expect((row.payload as Record<string, unknown>).observable_score).toBe(3);
});

it('claims: re-POST with a resolution updates in place', async () => {
  await postClaims(post('claims', [CLAIM]));
  await postClaims(
    post('claims', {
      ...CLAIM,
      status: 'hit',
      resolved_at: '2026-07-20',
      resolution_note: 'Closed at 4.43% on 2026-07-20.',
    }),
  );
  const rows = await db.select().from(claims);
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe('hit');
  expect(rows[0].resolvedAt).toBe('2026-07-20');
});

it('accepts the full pipeline status vocabulary', async () => {
  const statuses = ['pending', 'hit', 'miss', 'partial', 'expired', 'judgment-required', 'void'];
  for (const [i, status] of statuses.entries()) {
    const needsResolution = ['hit', 'miss', 'partial'].includes(status);
    const res = await postClaims(
      post('claims', {
        ...CLAIM,
        claim_id: `cl-status-${i}`,
        status,
        ...(needsResolution ? { resolved_at: '2026-07-20' } : {}),
      }),
    );
    expect(res.status).toBe(200);
  }
  const rows = await db.select().from(claims);
  expect(rows.map((r) => r.status).sort()).toEqual([...statuses].sort());
});

it('rejects mechanically decided claims without a resolution date', async () => {
  const res = await postClaims(post('claims', { ...CLAIM, status: 'hit' }));
  expect(res.status).toBe(422);
});

it('accepts source and opening-probability audit fields', async () => {
  const res = await postClaims(
    post('claims', {
      ...CLAIM,
      source_url: 'https://polymarket.com/event/example-market',
      opening_probability: 0.72,
      checkable: true,
      claim_kind: 'prediction-market',
    }),
  );
  expect(res.status).toBe(200);
  const [row] = await db.select().from(claims);
  expect((row.payload as Record<string, unknown>).opening_probability).toBe(0.72);
});

it('rejects unsafe or private claim source links', async () => {
  for (const sourceUrl of ['http://example.com/source', 'https://localhost/source']) {
    const res = await postClaims(post('claims', { ...CLAIM, source_url: sourceUrl }));
    expect(res.status).toBe(422);
  }
});

it('forward events: upcoming has null resolution; reconciled re-POST fills it', async () => {
  await postForward(post('forward-events', FORWARD));
  let [row] = await db.select().from(forwardEvents);
  expect(row.resolution).toBeNull();
  const res = await postForward(
    post('forward-events', {
      ...FORWARD,
      resolution: { outcome: 'Core +0.31%; front end sold off 6bp.', resolved_at: '2026-07-15' },
    }),
  );
  expect(await res.json()).toEqual({ ok: true, upserted: 1, revalidated: ['/catalysts'] });
  [row] = await db.select().from(forwardEvents);
  expect((row.resolution as Record<string, unknown>).outcome).toContain('Core +0.31%');
  expect(await db.select().from(forwardEvents)).toHaveLength(1);
});

it('forward events accept arrays', async () => {
  const res = await postForward(
    post('forward-events', [FORWARD, { ...FORWARD, event_id: 'fe-2026-07-30-fomc', date: '2026-07-30', event: 'FOMC decision' }]),
  );
  expect((await res.json()).upserted).toBe(2);
});

it('forward event authoritative snapshots delete rows absent from the projection', async () => {
  const stale = { ...FORWARD, event_id: 'stale-filler', event: 'Newsletter filler' };
  await postForward(post('forward-events', [FORWARD, stale]));
  expect(await db.select().from(forwardEvents)).toHaveLength(2);

  const res = await postForward(post('forward-events', { events: [FORWARD], replace: true }));
  expect(res.status).toBe(200);
  expect((await res.json()).upserted).toBe(1);
  expect((await db.select().from(forwardEvents)).map((row) => row.eventId)).toEqual([FORWARD.event_id]);

  await postForward(post('forward-events', { events: [], replace: true }));
  expect(await db.select().from(forwardEvents)).toHaveLength(0);
});
