import { sql } from 'drizzle-orm';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { briefs, claims, forwardEvents } from '@/db/schema';
import { createTestDb } from './helpers/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST: postBriefs } = await import('@/app/api/ingest/briefs/route');
const { POST: postClaims } = await import('@/app/api/ingest/claims/route');
const { POST: postForward } = await import('@/app/api/ingest/forward-events/route');

const TOKEN = 'test-token';

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost/api/ingest/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
}

// Microsecond-scale revisions (well above 2^31, below 2^53).
const R = (n: number) => 1_788_000_000_000_000 + n;

const BRIEF = {
  date: '2026-07-10',
  kind: 'daily',
  subject: 'Subject base',
  telegram_ping: 'Ping base',
  html: '<p>Body base</p>',
  sent_verified_at: '2026-07-10T14:05:00Z',
};
const briefRev = (n: number) => ({
  ...BRIEF,
  subject: `Subject r${n}`,
  telegram_ping: `Ping r${n}`,
  html: `<p>Body r${n}</p>`,
  revision: R(n),
});

const CLAIM = {
  claim_id: 'cl-rev-1',
  kind: 'map',
  themes: ['rate-path-repricing'],
  predicate: 'P1: 2y UST closes above 4.40%',
  data_anchor: 'UST 2y daily close',
  opening_probability: 0.4,
  claim_kind: 'prediction-market',
  market_type: 'rates',
  opened_at: '2026-06-24',
  expires_at: '2026-08-01',
  status: 'pending',
};

const FORWARD = {
  event_id: 'fe-rev-1',
  date: '2026-07-15',
  event: 'US CPI (June)',
  expectation: 'E1 consensus',
  surprise: 'S1 surprise',
};

let db: Db;

beforeEach(async () => {
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  db = await createTestDb();
});

it('briefs: revisions 1,3,2,3 end on revision 3; stale post is a 200 no-op; replay is idempotent', async () => {
  const r1 = await postBriefs(post('briefs', briefRev(1)));
  expect(await r1.json()).toMatchObject({ ok: true, upserted: 1 });

  const r3 = await postBriefs(post('briefs', briefRev(3)));
  expect(await r3.json()).toMatchObject({ ok: true, upserted: 1 });

  const r2 = await postBriefs(post('briefs', briefRev(2)));
  expect(r2.status).toBe(200);
  expect(await r2.json()).toMatchObject({ ok: true, upserted: 0, stale: 1 });
  let rows = await db.select().from(briefs);
  expect(rows).toHaveLength(1);
  expect(rows[0].subject).toBe('Subject r3');
  expect(rows[0].html).toBe('<p>Body r3</p>');
  expect(rows[0].revision).toBe(R(3));

  const again = await postBriefs(post('briefs', briefRev(3)));
  expect(again.status).toBe(200);
  const json = await again.json();
  expect(json.ok).toBe(true);
  expect(json.upserted).toBe(1);
  expect(json.stale ?? 0).toBe(0);
  rows = await db.select().from(briefs);
  expect(rows).toHaveLength(1);
  expect(rows[0].subject).toBe('Subject r3');
  expect(rows[0].html).toBe('<p>Body r3</p>');
});

it('claims: status follows revision 3 while the original prediction stays frozen', async () => {
  const r1 = { ...CLAIM, revision: R(1) };
  const r2 = {
    ...CLAIM,
    revision: R(2),
    predicate: 'P2 rewritten',
    opening_probability: 0.2,
    status: 'miss',
    resolved_at: '2026-07-18',
  };
  const r3 = {
    ...CLAIM,
    revision: R(3),
    predicate: 'P3 rewritten',
    opening_probability: 0.95,
    data_anchor: 'different anchor',
    kind: 'smart_money',
    themes: ['other'],
    opened_at: '2026-06-25',
    status: 'hit',
    resolved_at: '2026-07-20',
    resolution_note: 'Closed at 4.43%.',
  };

  expect(await (await postClaims(post('claims', r1))).json()).toMatchObject({ upserted: 1 });
  expect(await (await postClaims(post('claims', r3))).json()).toMatchObject({ upserted: 1 });

  const stale = await postClaims(post('claims', r2));
  expect(stale.status).toBe(200);
  expect(await stale.json()).toMatchObject({ ok: true, upserted: 0, stale: 1 });

  const replay = await postClaims(post('claims', r3));
  const replayJson = await replay.json();
  expect(replayJson.upserted).toBe(1);
  expect(replayJson.stale ?? 0).toBe(0);

  const rows = await db.select().from(claims);
  expect(rows).toHaveLength(1);
  const row = rows[0];
  const payload = row.payload as Record<string, unknown>;
  expect(row.revision).toBe(R(3));
  expect(row.status).toBe('hit');
  expect(row.resolvedAt).toBe('2026-07-20');
  expect(payload.status).toBe('hit');
  expect(payload.resolution_note).toBe('Closed at 4.43%.');
  // Prediction fields stay as first stored.
  expect(payload.predicate).toBe(CLAIM.predicate);
  expect(payload.opening_probability).toBe(0.4);
  expect(payload.data_anchor).toBe(CLAIM.data_anchor);
  expect(payload.opened_at).toBe('2026-06-24');
  expect(payload.kind).toBe('map');
  expect(payload.themes).toEqual(['rate-path-repricing']);
  expect(row.kind).toBe('map');
  expect(row.themes).toEqual(['rate-path-repricing']);
  expect(row.openedAt).toBe('2026-06-24');
  expect(row.original).toMatchObject({
    predicate: CLAIM.predicate,
    opening_probability: 0.4,
    opened_at: '2026-06-24',
    market_type: 'rates',
  });
});

it('forward events: revisions 1,3,2,3 end on revision 3 with the first expectation/surprise', async () => {
  const r1 = { ...FORWARD, revision: R(1) };
  const r2 = { ...FORWARD, revision: R(2), event: 'r2 title', expectation: 'E2', surprise: 'S2' };
  const r3 = {
    ...FORWARD,
    revision: R(3),
    event: 'US CPI (June, revised)',
    date: '2026-07-16',
    expectation: 'E3',
    surprise: 'S3',
    resolution: { outcome: 'Core +0.31%', resolved_at: '2026-07-16' },
  };

  expect(await (await postForward(post('forward-events', r1))).json()).toMatchObject({ upserted: 1 });
  expect(await (await postForward(post('forward-events', r3))).json()).toMatchObject({ upserted: 1 });

  const stale = await postForward(post('forward-events', r2));
  expect(stale.status).toBe(200);
  expect(await stale.json()).toMatchObject({ ok: true, upserted: 0, stale: 1 });

  const replay = await (await postForward(post('forward-events', r3))).json();
  expect(replay.upserted).toBe(1);
  expect(replay.stale ?? 0).toBe(0);

  const rows = await db.select().from(forwardEvents);
  expect(rows).toHaveLength(1);
  const payload = rows[0].payload as Record<string, unknown>;
  expect(rows[0].revision).toBe(R(3));
  expect(payload.event).toBe('US CPI (June, revised)');
  expect(rows[0].eventDate).toBe('2026-07-16');
  expect((rows[0].resolution as Record<string, unknown>).outcome).toBe('Core +0.31%');
  expect(payload.expectation).toBe('E1 consensus');
  expect(payload.surprise).toBe('S1 surprise');
});

it('legacy payloads are rejected as stale once a row has a revision, and accepted over legacy rows', async () => {
  // Brief
  await postBriefs(post('briefs', briefRev(5)));
  const legacy = await postBriefs(post('briefs', { ...BRIEF, subject: 'Legacy overwrite' }));
  expect(legacy.status).toBe(200);
  expect(await legacy.json()).toMatchObject({ upserted: 0, stale: 1 });
  expect((await db.select().from(briefs))[0].subject).toBe('Subject r5');

  // Legacy-over-legacy still works (stored revision 0).
  await postBriefs(post('briefs', { ...BRIEF, date: '2026-07-11' }));
  const ok = await postBriefs(post('briefs', { ...BRIEF, date: '2026-07-11', subject: 'Legacy v2' }));
  expect(await ok.json()).toMatchObject({ upserted: 1 });
  const row = (await db.select().from(briefs)).find((b) => b.date === '2026-07-11');
  expect(row?.subject).toBe('Legacy v2');
  expect(row?.revision).toBe(0);

  // Claim
  await postClaims(post('claims', { ...CLAIM, revision: R(5) }));
  const legacyClaim = await postClaims(
    post('claims', { ...CLAIM, status: 'void' }),
  );
  expect(await legacyClaim.json()).toMatchObject({ upserted: 0, stale: 1 });
  expect((await db.select().from(claims))[0].status).toBe('pending');

  await postClaims(post('claims', { ...CLAIM, claim_id: 'cl-legacy' }));
  const legacyOk = await postClaims(post('claims', { ...CLAIM, claim_id: 'cl-legacy', status: 'void' }));
  expect(await legacyOk.json()).toMatchObject({ upserted: 1 });
  const legacyRow = (await db.select().from(claims)).find((c) => c.claimId === 'cl-legacy');
  expect(legacyRow?.status).toBe('void');
});

it('a stale replace snapshot does not delete newer rows', async () => {
  const a = { ...FORWARD, event_id: 'fe-a', revision: R(5) };
  const b = { ...FORWARD, event_id: 'fe-b', revision: R(5) };
  await postForward(post('forward-events', [a, b]));

  const staleSnapshot = await postForward(
    post('forward-events', {
      replace: true,
      revision: R(2),
      events: [
        { ...FORWARD, event_id: 'fe-a', event: 'old title' },
        { ...FORWARD, event_id: 'fe-c' },
      ],
    }),
  );
  expect(staleSnapshot.status).toBe(200);
  const json = await staleSnapshot.json();
  expect(json.ok).toBe(true);
  expect(json.upserted).toBe(1); // fe-c is new and passes its row guard
  expect(json.stale).toBeGreaterThanOrEqual(1);

  const rows = await db.select().from(forwardEvents);
  expect(rows.map((r) => r.eventId).sort()).toEqual(['fe-a', 'fe-b', 'fe-c']);
  const rowA = rows.find((r) => r.eventId === 'fe-a');
  expect((rowA?.payload as Record<string, unknown>).event).toBe('US CPI (June)');

  // A current snapshot still deletes absent rows.
  const fresh = await postForward(
    post('forward-events', { replace: true, revision: R(6), events: [{ ...a, revision: R(6) }] }),
  );
  const freshJson = await fresh.json();
  expect(freshJson.upserted).toBe(1);
  expect(freshJson.stale ?? 0).toBe(0);
  expect((await db.select().from(forwardEvents)).map((r) => r.eventId)).toEqual(['fe-a']);
});

it('an empty legacy snapshot does not wipe revisioned rows', async () => {
  await postForward(post('forward-events', { ...FORWARD, revision: R(4) }));
  const res = await postForward(post('forward-events', { events: [], replace: true }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, upserted: 0, stale: 1 });
  expect(await db.select().from(forwardEvents)).toHaveLength(1);
});

it('migration adds revision columns and claims.original', async () => {
  const res = (await db.execute(sql`
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and ((column_name = 'revision' and table_name in ('briefs', 'claims', 'forward_events'))
        or (table_name = 'claims' and column_name = 'original'))
  `)) as unknown as {
    rows: { table_name: string; column_name: string; data_type: string; is_nullable: string }[];
  };
  const find = (t: string, c: string) =>
    res.rows.find((r) => r.table_name === t && r.column_name === c);
  for (const table of ['briefs', 'claims', 'forward_events']) {
    expect(find(table, 'revision')).toMatchObject({ data_type: 'bigint', is_nullable: 'NO' });
  }
  expect(find('claims', 'original')).toMatchObject({ data_type: 'jsonb', is_nullable: 'YES' });
});
