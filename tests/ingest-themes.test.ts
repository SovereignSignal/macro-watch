import { eq } from 'drizzle-orm';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { themeEvents, themes, themeState } from '@/db/schema';
import { createTestDb } from './helpers/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST: postEvents } = await import('@/app/api/ingest/theme-events/route');
const { POST: postState } = await import('@/app/api/ingest/theme-state/route');

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

const EVENT = {
  event_id: 'te-2026-06-24-rate-path-1',
  date: '2026-06-24',
  theme_slug: 'rate-path-repricing',
  theme_name: 'Rate-path repricing',
  direction: 'raise',
  evidence: 'Payrolls beat plus hawkish minutes; the two-year repriced 15bp.',
  trigger_state: '2 of 3 triggers live',
  next_check: '2026-07-15 CPI',
  source: 'daily',
};

const STATE = {
  taken_at: '2026-07-11T12:10:00Z',
  payload: {
    as_of: '2026-07-11',
    themes: [
      {
        slug: 'rate-path-repricing',
        name: 'Rate-path repricing',
        conviction: 'high',
        current_read: 'The front end is still underpricing how slow the cutting cycle gets.',
        raise_conditions: ['Core CPI re-accelerates'],
        lower_conditions: 'Labor market cracks',
        triggers: [{ name: '2y auction demand', state: 'live' }],
      },
    ],
  },
};

let db: Db;

beforeEach(async () => {
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  db = await createTestDb();
});

it('rejects theme events without a token', async () => {
  expect((await postEvents(post('theme-events', EVENT, null))).status).toBe(401);
});

it('rejects a bad direction with 422', async () => {
  expect((await postEvents(post('theme-events', { ...EVENT, direction: 'sideways' }))).status).toBe(422);
});

it('accepts a single event object and creates the theme row', async () => {
  const res = await postEvents(post('theme-events', EVENT));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, upserted: 1, revalidated: ['/', '/map'] });
  const trows = await db.select().from(themes);
  expect(trows).toEqual([
    {
      slug: 'rate-path-repricing',
      name: 'Rate-path repricing',
      status: 'active',
      firstSeen: '2026-06-24',
      lastEventAt: '2026-06-24',
    },
  ]);
});

it('accepts an array, is idempotent, and derives lifecycle status', async () => {
  const batch = [
    { ...EVENT, event_id: 'te-a', date: '2026-06-20', direction: 'candidate' },
    { ...EVENT, event_id: 'te-b', date: '2026-06-24', direction: 'raise' },
  ];
  const res = await postEvents(post('theme-events', batch));
  expect((await res.json()).upserted).toBe(2);
  await postEvents(post('theme-events', batch)); // re-POST: no dupes
  expect(await db.select().from(themeEvents)).toHaveLength(2);
  const [t] = await db.select().from(themes);
  expect(t.status).toBe('active'); // newest event (raise) wins
  expect(t.firstSeen).toBe('2026-06-20');
  expect(t.lastEventAt).toBe('2026-06-24');
});

it('does not regress status when an older event backfills later', async () => {
  await postEvents(post('theme-events', { ...EVENT, event_id: 'te-new', date: '2026-07-08', direction: 'raise' }));
  await postEvents(post('theme-events', { ...EVENT, event_id: 'te-old', date: '2026-06-20', direction: 'candidate' }));
  const [t] = await db.select().from(themes).where(eq(themes.slug, 'rate-path-repricing'));
  expect(t.status).toBe('active'); // 2026-07-08 raise still governs
  expect(t.firstSeen).toBe('2026-06-20');
  expect(t.lastEventAt).toBe('2026-07-08');
});

it('retire flips the theme to retired', async () => {
  await postEvents(post('theme-events', EVENT));
  await postEvents(post('theme-events', { ...EVENT, event_id: 'te-r', date: '2026-07-05', direction: 'retire' }));
  const [t] = await db.select().from(themes);
  expect(t.status).toBe('retired');
});

it('upserts theme state idempotently on taken_at', async () => {
  const res = await postState(post('theme-state', STATE));
  expect(await res.json()).toEqual({ ok: true, upserted: 1, revalidated: ['/', '/map'] });
  await postState(post('theme-state', { ...STATE, payload: { themes: [] } }));
  const rows = await db.select().from(themeState);
  expect(rows).toHaveLength(1);
  expect(rows[0].payload).toEqual({ themes: [] });
});

it('rejects theme state missing taken_at with 422', async () => {
  expect((await postState(post('theme-state', { payload: { themes: [] } }))).status).toBe(422);
});
