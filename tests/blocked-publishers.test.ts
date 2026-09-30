import { beforeEach, expect, it, vi } from 'vitest';
import { briefs, claims, themeEvents } from '@/db/schema';
import type { Db } from '@/db/client';
import { blockedPublisherIssue, blockedPublisherTerms } from '@/lib/security/blocked-publishers';
import { sanitizePublicBriefHtml, sanitizePublicBriefText } from '@/lib/security/public-brief-html';
import { createTestDb } from './helpers/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST: postBrief } = await import('@/app/api/ingest/briefs/route');
const { POST: postResearch } = await import('@/app/api/ingest/research/route');
const { POST: postClaims } = await import('@/app/api/ingest/claims/route');
const { POST: postEvents } = await import('@/app/api/ingest/theme-events/route');

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

const BRIEF = {
  date: '2026-07-10',
  kind: 'daily',
  subject: 'Front-end repricing meets a heavy auction week',
  telegram_ping: 'Two-year yields snapped higher into supply.',
  html: '<h2>Rates</h2><p>The two-year backed up nine basis points.</p>',
  sent_verified_at: '2026-07-10T14:05:00Z',
};

const RESEARCH = {
  date: '2026-08-17',
  topic: 'Dedollarization / BRICS',
  finding: 'The weakest assumption is the binary description of the capital account.',
  changed: 'Evidence now separates reserve shares, settlement, and safe-asset supply.',
  decision: 'Change the action at the margin; keep the liquid dollar base.',
  watch: 'COFER shares, RMB convertibility, official Treasury flows, gold purchases.',
  citations: [{ url: 'https://www.imf.org/cofer', title: 'IMF COFER' }],
  generated_at: '2026-08-17T07:04:00Z',
};

const CLAIM = {
  claim_id: 'cl-clean',
  kind: 'map',
  themes: ['rate-path-repricing'],
  predicate: '2y UST closes above 4.40% before 2026-08-01',
  opened_at: '2026-06-24',
  status: 'pending',
};

const EVENT = {
  event_id: 'te-clean',
  date: '2026-07-08',
  theme_slug: 'rate-path-repricing',
  theme_name: 'Rate-path repricing',
  direction: 'raise',
  evidence: 'The front end cheapened into supply.',
  source: 'daily',
};

let db: Db;

beforeEach(async () => {
  delete process.env.BLOCKED_PUBLISHERS;
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  db = await createTestDb();
});

it('blocks paywalled and email-only outlets by default', () => {
  for (const term of ['bloomberg', 'alpha picks', 'ap research', 'alyosha', 'market vibes', 'the economist', 'economist.com']) {
    expect(blockedPublisherTerms()).toContain(term);
  }
  expect(blockedPublisherIssue({ note: 'The Economist weekly' })).toMatch(/the economist/i);
  expect(blockedPublisherIssue({ note: 'Alyosha on the dollar' })).toMatch(/alyosha/);
  expect(blockedPublisherIssue({ note: 'Market Vibes tape' })).toMatch(/market vibes/);
  expect(blockedPublisherIssue({ note: 'AP Research desk' })).toMatch(/ap research/);
  expect(blockedPublisherIssue({ note: 'A labor economist disagreed.' })).toBeNull();
});

it('blocks Bloomberg by default and keeps extra publishers configurable', () => {
  expect(blockedPublisherTerms()).toContain('bloomberg');
  expect(blockedPublisherIssue({ html: 'See BLOOMBERG.COM/news' })).toMatch(/blocked publisher "bloomberg/i);
  expect(blockedPublisherIssue({ note: '&#66;loomberg desk' })).toMatch(/bloomberg/);
  process.env.BLOCKED_PUBLISHERS = 'acmewire';
  expect(blockedPublisherTerms()).toEqual(expect.arrayContaining(['bloomberg', 'acmewire']));
  expect(blockedPublisherIssue({ ping: 'AcmeWire morning note' })).toMatch(/acmewire/);
  expect(blockedPublisherIssue({ html: '<p>The two-year rose.</p>' })).toBeNull();
});

it('strips an email-only research-inputs block on ingest and still rejects Bloomberg inside one', async () => {
  const cleaned = await postBrief(post('briefs', {
    ...BRIEF,
    html: '<p>Public lead.</p><div class="research-inputs"><p>Oil under 70 stays in the email.</p></div><p>Public close.</p>',
  }));
  expect(cleaned.status).toBe(200);
  const [row] = await db.select().from(briefs);
  expect(row.html).toContain('Public lead.');
  expect(row.html).toContain('Public close.');
  expect(row.html.toLowerCase()).not.toContain('oil under 70');
  expect(row.html).not.toContain('research-inputs');

  const blocked = await postBrief(post('briefs', {
    ...BRIEF,
    date: '2026-07-12',
    html: '<p>Public lead.</p><div class="research-inputs"><p>See Bloomberg for the auction.</p></div>',
  }));
  expect(blocked.status).toBe(422);
});

it('rejects a brief that names a blocked publisher and still accepts a clean daily', async () => {
  const blocked = await postBrief(post('briefs', { ...BRIEF, html: '<p>See https://www.bloomberg.com/news/x</p>' }));
  expect(blocked.status).toBe(422);
  expect(JSON.stringify(await blocked.json()).toLowerCase()).toContain('blocked publisher');
  expect(await db.select().from(briefs)).toHaveLength(0);

  const unauthorized = await postBrief(post('briefs', { ...BRIEF, subject: 'Bloomberg open' }, null));
  expect(unauthorized.status).toBe(401);

  expect((await postBrief(post('briefs', BRIEF))).status).toBe(200);
  const weekend = await postBrief(post('briefs', { ...BRIEF, date: '2026-07-11', kind: 'weekend' }));
  expect(weekend.status).toBe(200);
});

it('rejects blocked text in research, claims, and theme events', async () => {
  expect((await postResearch(post('research', { ...RESEARCH, finding: 'A Bloomberg wire changed the read.' }))).status).toBe(422);
  expect((await postResearch(post('research', {
    ...RESEARCH,
    citations: [{ url: 'https://www.bloomberg.com/news/story', title: 'Wire' }],
  }))).status).toBe(422);
  expect((await postResearch(post('research', RESEARCH))).status).toBe(200);

  expect((await postClaims(post('claims', { ...CLAIM, predicate: 'Bloomberg says the cut is priced.' }))).status).toBe(422);
  expect((await postClaims(post('claims', CLAIM))).status).toBe(200);
  expect(await db.select().from(claims)).toHaveLength(1);

  expect((await postEvents(post('theme-events', { ...EVENT, evidence: 'From Bloomberg.com' }))).status).toBe(422);
  expect((await postEvents(post('theme-events', EVENT))).status).toBe(200);
  expect(await db.select().from(themeEvents)).toHaveLength(1);
});

it('blocks Alpha Picks by default even when BLOCKED_PUBLISHERS names something else', async () => {
  expect(blockedPublisherTerms()).toEqual(expect.arrayContaining(['alphapicks', 'alpha picks']));
  expect(blockedPublisherIssue({ html: 'https://alphapicks.co.uk/p/so-called-bessent-put' })).toMatch(/alphapicks/);
  expect(blockedPublisherIssue({ note: 'Alpha Picks morning note' })).toMatch(/alpha picks/);

  process.env.BLOCKED_PUBLISHERS = 'acmewire';
  expect(blockedPublisherTerms()).toEqual(expect.arrayContaining(['alphapicks', 'alpha picks', 'acmewire']));
  expect(blockedPublisherIssue({ html: '<p>See alphapicks.co.uk for the call.</p>' })).toMatch(/alphapicks/);

  const blocked = await postBrief(post('briefs', { ...BRIEF, html: '<p>Alpha Picks says the backstop is live.</p>' }));
  expect(blocked.status).toBe(422);
  expect(await db.select().from(briefs)).toHaveLength(0);

  const clean = sanitizePublicBriefText('Talk of an official backstop, per Alpha Picks.');
  expect(clean.toLowerCase()).not.toContain('alpha picks');
  expect(clean.toLowerCase()).not.toContain('alphapicks');
  const html = sanitizePublicBriefHtml(
    '<p>Talk of an official backstop. <a href="https://alphapicks.co.uk/p/note">the note</a></p><p>The two-year rose.</p>',
  );
  expect(html.toLowerCase()).not.toContain('alphapicks');
  expect(html).toContain('The two-year rose.');
});

it('redacts a stored publisher name at render time', () => {
  expect(sanitizePublicBriefText('Markets per Bloomberg').toLowerCase()).not.toContain('bloomberg');
  expect(sanitizePublicBriefText('Markets per Bloomberg')).toContain('[redacted source]');
});
