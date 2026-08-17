import { beforeEach, expect, it, vi } from 'vitest';
import { researchMemos } from '@/db/schema';
import type { Db } from '@/db/client';
import { createTestDb } from './helpers/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST } = await import('@/app/api/ingest/research/route');

const TOKEN = 'test-token';

function post(body: unknown, token: string | null = TOKEN): Request {
  return new Request('http://localhost/api/ingest/research', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const VALID = {
  date: '2026-08-17',
  topic: 'Dedollarization / BRICS',
  finding: 'The weakest assumption is the binary description of the capital account.',
  changed: 'Evidence now separates reserve shares, settlement, and safe-asset supply.',
  decision: 'Change the action at the margin; keep the liquid dollar base.',
  watch: 'COFER shares, RMB convertibility, official Treasury flows, gold purchases.',
  citations: [{ url: 'https://www.imf.org/cofer', title: 'IMF COFER' }],
  generated_at: '2026-08-17T07:04:00Z',
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

it('upserts idempotently on date and stores sanitized sections', async () => {
  expect((await POST(post(VALID))).status).toBe(200);
  expect((await POST(post({ ...VALID, decision: 'Revised call.' }))).status).toBe(200);
  const rows = await db.select().from(researchMemos);
  expect(rows).toHaveLength(1);
  expect(rows[0].topic).toContain('Dedollarization');
  expect(rows[0].decision).toBe('Revised call.');
  expect(Array.isArray(rows[0].citations)).toBe(true);
});

it('rejects non-https citations and malformed dates', async () => {
  const badCite = { ...VALID, citations: [{ url: 'http://insecure.example/x' }] };
  expect((await POST(post(badCite))).status).toBe(422);
  expect((await POST(post({ ...VALID, date: '17-08-2026' }))).status).toBe(422);
});
