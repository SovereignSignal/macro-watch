import { beforeEach, expect, it, vi } from 'vitest';
import { briefs } from '@/db/schema';
import type { Db } from '@/db/client';
import { createTestDb } from './helpers/db';

// revalidatePath needs a Next.js request scope; mock it for unit tests.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST } = await import('@/app/api/ingest/briefs/route');

const TOKEN = 'test-token';

function post(body: unknown, token: string | null = TOKEN): Request {
  return new Request('http://localhost/api/ingest/briefs', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const VALID = {
  date: '2026-07-10',
  kind: 'daily',
  subject: 'Front-end repricing meets a heavy auction week',
  telegram_ping: 'Two-year yields snapped higher into supply.',
  html: '<h2>Rates</h2><p>The two-year backed up nine basis points.</p>',
  sent_verified_at: '2026-07-10T14:05:00Z',
};

let db: Db;

beforeEach(async () => {
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  db = await createTestDb();
});

it('rejects a missing or wrong bearer token with 401', async () => {
  expect((await POST(post(VALID, null))).status).toBe(401);
  expect((await POST(post(VALID, 'wrong'))).status).toBe(401);
});

it('rejects everything when the token env is unset', async () => {
  delete process.env.MACRO_WATCH_INGEST_TOKEN;
  expect((await POST(post(VALID))).status).toBe(401);
});

it('rejects an invalid payload with 422 and reasons', async () => {
  const res = await POST(post({ ...VALID, kind: 'monthly' }));
  expect(res.status).toBe(422);
  const json = await res.json();
  expect(json.ok).toBe(false);
  expect(json.issues.length).toBeGreaterThan(0);
});

it('rejects a non-JSON body with 422', async () => {
  const req = new Request('http://localhost/api/ingest/briefs', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}` },
    body: 'not json',
  });
  expect((await POST(req)).status).toBe(422);
});

it('upserts and reports revalidated paths', async () => {
  const res = await POST(post(VALID));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    ok: true,
    upserted: 1,
    revalidated: ['/', '/briefs', '/briefs/2026-07-10', '/feed.xml'],
  });
});

it('re-POST updates in place (idempotent on date)', async () => {
  await POST(post(VALID));
  await POST(post({ ...VALID, subject: 'Front-end repricing (revised)' }));
  const rows = await db.select().from(briefs);
  expect(rows).toHaveLength(1);
  expect(rows[0].subject).toBe('Front-end repricing (revised)');
});
