import { eq } from 'drizzle-orm';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { themeEvents, themes, themeState } from '@/db/schema';
import { themeStateSchema, upsertThemeState } from '@/lib/ingest/themes';
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
        status: 'active',
        current_read: 'The front end is still underpricing how slow the cutting cycle gets.',
        evidence: 'Payrolls beat — the two-year repriced 15bp.',
        evidence_lifecycle: {
          version: 1,
          basis_novelty: 'updated',
          balance: 'supporting',
          confidence_change: 'raised',
          last_basis_change_date: '2026-07-08',
          repeat_count: 0,
        },
        last_seen: '2026-07-08',
        last_changed: '2026-07-08',
        next_check: '2026-07-15 — CPI',
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

it('does not overwrite name when an older event with a different name backfills later', async () => {
  await postEvents(
    post('theme-events', {
      ...EVENT,
      event_id: 'te-name-new',
      date: '2026-07-08',
      direction: 'raise',
      theme_name: 'Rate-path repricing v2',
    }),
  );
  await postEvents(
    post('theme-events', {
      ...EVENT,
      event_id: 'te-name-old',
      date: '2026-06-20',
      direction: 'candidate',
      theme_name: 'Some stale name',
    }),
  );
  const [t] = await db.select().from(themes).where(eq(themes.slug, 'rate-path-repricing'));
  expect(t.name).toBe('Rate-path repricing v2'); // older event's name never lands
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

it('accepts an atomic evidence lifecycle and remains backward compatible when it is absent', () => {
  expect(themeStateSchema.safeParse(STATE).success).toBe(true);
  const legacy = structuredClone(STATE) as any;
  legacy.payload.themes = [{
    slug: 'legacy-theme',
    name: 'Legacy theme',
    status: 'candidate',
    evidence_novelty: 'new',
    source_urls: ['https://internal.example/source'],
  }];
  const parsed = themeStateSchema.parse(legacy);
  expect(parsed.payload.themes[0]).toEqual({
    slug: 'legacy-theme',
    name: 'Legacy theme',
    status: 'candidate',
  });
});

it('accepts legacy empty optional text and normalizes it to null', async () => {
  const legacy = structuredClone(STATE) as any;
  Object.assign(legacy.payload.themes[0], {
    description: '',
    current_read: '   ',
    evidence: '',
    next_check: '   ',
  });
  const parsed = themeStateSchema.parse(legacy);
  expect(parsed.payload.themes[0]).toMatchObject({
    description: null,
    current_read: null,
    evidence: null,
    next_check: null,
  });
  await upsertThemeState(db, legacy);
  const [row] = await db.select().from(themeState);
  expect((row.payload as any).themes[0]).toMatchObject({
    description: null,
    current_read: null,
    evidence: null,
    next_check: null,
  });
});

it.each([
  ['partial object', (card: any) => { delete card.evidence_lifecycle.version; }],
  ['wrong version', (card: any) => { card.evidence_lifecycle.version = 2; }],
  ['wrong novelty', (card: any) => { card.evidence_lifecycle.basis_novelty = 'new'; }],
  ['wrong balance', (card: any) => { card.evidence_lifecycle.balance = 'bullish'; }],
  ['wrong confidence change', (card: any) => { card.evidence_lifecycle.confidence_change = 'up'; }],
  ['malformed basis date', (card: any) => { card.evidence_lifecycle.last_basis_change_date = '2026-7-08'; }],
  ['impossible basis date', (card: any) => { card.evidence_lifecycle.last_basis_change_date = '2026-02-30'; }],
  ['negative repeat count', (card: any) => { card.evidence_lifecycle.repeat_count = -1; }],
  ['fractional repeat count', (card: any) => { card.evidence_lifecycle.repeat_count = 1.5; }],
  ['unsafe repeat count', (card: any) => { card.evidence_lifecycle.repeat_count = Number.MAX_SAFE_INTEGER + 1; }],
  ['updated with repeats', (card: any) => { card.evidence_lifecycle.repeat_count = 1; }],
  ['repeated without repeats', (card: any) => {
    card.evidence_lifecycle.basis_novelty = 'repeated';
    card.evidence_lifecycle.repeat_count = 0;
  }],
  ['basis after last seen', (card: any) => {
    card.evidence_lifecycle.last_basis_change_date = '2026-07-09';
  }],
  ['malformed last seen', (card: any) => { card.last_seen = 'yesterday'; }],
  ['unknown status', (card: any) => { card.status = 'watching'; }],
])('rejects malformed evidence lifecycle: %s', (_label, mutate) => {
  const malformed = structuredClone(STATE) as any;
  mutate(malformed.payload.themes[0]);
  expect(themeStateSchema.safeParse(malformed).success).toBe(false);
});

it('strips unknown/internal keys and persists only the exact public card contract', async () => {
  const dirty = structuredClone(STATE) as any;
  dirty.hash = 'root-hash';
  dirty.payload.history = [{ hidden: true }];
  const card = dirty.payload.themes[0];
  card.source_urls = ['https://internal.example/source'];
  card.history = [{ hidden: true }];
  card.hash = 'card-hash';
  card.evidence_novelty = 'new';
  card.last_new_evidence_date = '2026-07-08';
  card.triggers[0].source_url = 'https://internal.example/trigger';
  card.evidence_lifecycle.hash = 'lifecycle-hash';

  await upsertThemeState(db, dirty);
  const [row] = await db.select().from(themeState);
  const payload = row.payload as any;
  expect(Object.keys(payload).sort()).toEqual(['as_of', 'themes']);
  expect(Object.keys(payload.themes[0]).sort()).toEqual([
    'conviction',
    'current_read',
    'evidence',
    'evidence_lifecycle',
    'last_changed',
    'last_seen',
    'lower_conditions',
    'name',
    'next_check',
    'raise_conditions',
    'slug',
    'status',
    'triggers',
  ]);
  expect(Object.keys(payload.themes[0].evidence_lifecycle).sort()).toEqual([
    'balance',
    'basis_novelty',
    'confidence_change',
    'last_basis_change_date',
    'repeat_count',
    'version',
  ]);
  expect(Object.keys(payload.themes[0].triggers[0]).sort()).toEqual(['name', 'state']);
  expect(payload.themes[0].evidence).toBe('Payrolls beat, the two-year repriced 15bp.');
  expect(payload.themes[0].next_check).toBe('2026-07-15, CPI');
  expect(JSON.stringify(payload)).not.toMatch(/source_urls|source_url|history|hash|evidence_novelty|last_new_evidence_date/);
});
