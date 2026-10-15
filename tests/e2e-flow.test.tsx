import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { createTestDb } from './helpers/db';

// Members-only sections render for a signed-in member in these tests.
vi.mock('@/lib/member-session', () => ({ isMember: async () => true }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST: postBrief } = await import('@/app/api/ingest/briefs/route');
const { POST: postThemeEvents } = await import('@/app/api/ingest/theme-events/route');
const { POST: postThemeState } = await import('@/app/api/ingest/theme-state/route');
const { POST: postPanels } = await import('@/app/api/ingest/panels/route');
const { default: HomePage } = await import('@/app/page');

const TOKEN = 'e2e-token';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf8'));
}

function post(path_: string, body: unknown): Request {
  return new Request(`http://localhost/api/ingest/${path_}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  await createTestDb();
});

it('ingest fixture -> home page shows it (full wiring)', async () => {
  const briefsFx = fixture('briefs.json') as unknown[];
  for (const b of briefsFx) {
    expect((await postBrief(post('briefs', b))).status).toBe(200);
  }
  expect((await postThemeEvents(post('theme-events', fixture('theme-events.json')))).status).toBe(200);
  expect((await postThemeState(post('theme-state', fixture('theme-state.json')))).status).toBe(200);
  for (const p of fixture('panels.json') as unknown[]) {
    expect((await postPanels(post('panels', p))).status).toBe(200);
  }
  expect((await postPanels(post('panels', {
    kind: 'odds_lens',
    taken_at: '2026-07-11T12:05:00Z',
    payload: { rows: [{ label: 'LEGACY RAW ODDS', value: 0.725 }] },
  }))).status).toBe(200);

  const markup = renderToStaticMarkup(await HomePage());
  expect(markup).toContain('Weekend review: what the map got right about the dollar'); // latest brief
  expect(markup).toContain('6,412.50'); // dashboard panel row
  expect(markup).toContain('Prediction Market Lens');
  expect(markup).toContain('Fed cut by September');
  expect(markup).toContain('2 markets from 28 tracked-wallet signals');
  expect(markup).not.toMatch(/schema|\bv2\b|AMS/i);
  expect(markup).not.toContain('LEGACY RAW ODDS');
  expect(markup).toContain('Rate-path repricing'); // theme strip
  expect(markup).toContain('href="/map/dollar-downtrend"');
});
