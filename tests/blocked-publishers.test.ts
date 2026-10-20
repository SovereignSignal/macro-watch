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
  for (const term of ['northwire', 'desk picks', 'dp research', 'corvina', 'cv101', 'desk notes', 'the halvorsen', 'halvorsen.com', 'halvorsen']) {
    expect(blockedPublisherTerms()).toContain(term);
  }
  expect(blockedPublisherIssue({ note: 'The Halvorsen weekly' })).toMatch(/the halvorsen/i);
  expect(blockedPublisherIssue({ note: 'Corvina on the dollar' })).toMatch(/corvina/);
  expect(blockedPublisherIssue({ note: 'Desk Notes tape' })).toMatch(/desk notes/);
  expect(blockedPublisherIssue({ note: 'Dp Research desk' })).toMatch(/dp research/);
  expect(blockedPublisherIssue({ html: 'https://cv101.substack.com/p/note' })).toMatch(/cv101/);
  expect(blockedPublisherIssue({ note: 'A labor halvorsen disagreed.' })).toMatch(/halvorsen/);
  expect(blockedPublisherIssue({ note: 'Halvorsens at the Fed disagreed.' })).toBeNull();
  expect(blockedPublisherIssue({ note: 'The economy slowed.' })).toBeNull();
});

it('blocks Northwire by default and keeps extra publishers configurable', () => {
  expect(blockedPublisherTerms()).toContain('northwire');
  expect(blockedPublisherIssue({ html: 'See NORTHWIRE.COM/news' })).toMatch(/blocked publisher "northwire/i);
  expect(blockedPublisherIssue({ note: '&#78;orthwire desk' })).toMatch(/northwire/);
  process.env.BLOCKED_PUBLISHERS = 'acmewire';
  expect(blockedPublisherTerms()).toEqual(expect.arrayContaining(['northwire', 'acmewire']));
  expect(blockedPublisherIssue({ ping: 'AcmeWire morning note' })).toMatch(/acmewire/);
  expect(blockedPublisherIssue({ html: '<p>The two-year rose.</p>' })).toBeNull();
});

it('strips an email-only research-inputs block on ingest and still rejects Northwire inside one', async () => {
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
    html: '<p>Public lead.</p><div class="research-inputs"><p>See Northwire for the auction.</p></div>',
  }));
  expect(blocked.status).toBe(422);
});

it('rejects a brief that names a blocked publisher and still accepts a clean daily', async () => {
  const blocked = await postBrief(post('briefs', { ...BRIEF, html: '<p>See https://www.northwire.com/news/x</p>' }));
  expect(blocked.status).toBe(422);
  expect(JSON.stringify(await blocked.json()).toLowerCase()).toContain('blocked publisher');
  expect(await db.select().from(briefs)).toHaveLength(0);

  const unauthorized = await postBrief(post('briefs', { ...BRIEF, subject: 'Northwire open' }, null));
  expect(unauthorized.status).toBe(401);

  expect((await postBrief(post('briefs', BRIEF))).status).toBe(200);
  const weekend = await postBrief(post('briefs', { ...BRIEF, date: '2026-07-11', kind: 'weekend' }));
  expect(weekend.status).toBe(200);
});

it('rejects blocked text in research, claims, and theme events', async () => {
  expect((await postResearch(post('research', { ...RESEARCH, finding: 'A Northwire wire changed the read.' }))).status).toBe(422);
  expect((await postResearch(post('research', {
    ...RESEARCH,
    citations: [{ url: 'https://www.northwire.com/news/story', title: 'Wire' }],
  }))).status).toBe(422);
  expect((await postResearch(post('research', RESEARCH))).status).toBe(200);

  expect((await postClaims(post('claims', { ...CLAIM, predicate: 'Northwire says the cut is priced.' }))).status).toBe(422);
  expect((await postClaims(post('claims', CLAIM))).status).toBe(200);
  expect(await db.select().from(claims)).toHaveLength(1);

  expect((await postEvents(post('theme-events', { ...EVENT, evidence: 'From Northwire.com' }))).status).toBe(422);
  expect((await postEvents(post('theme-events', EVENT))).status).toBe(200);
  expect(await db.select().from(themeEvents)).toHaveLength(1);
});

it('blocks Desk Picks by default even when BLOCKED_PUBLISHERS names something else', async () => {
  expect(blockedPublisherTerms()).toEqual(expect.arrayContaining(['deskpicks', 'desk picks']));
  expect(blockedPublisherIssue({ html: 'https://deskpicks.co.uk/p/so-called-bessent-put' })).toMatch(/deskpicks/);
  expect(blockedPublisherIssue({ note: 'Desk Picks morning note' })).toMatch(/desk picks/);

  process.env.BLOCKED_PUBLISHERS = 'acmewire';
  expect(blockedPublisherTerms()).toEqual(expect.arrayContaining(['deskpicks', 'desk picks', 'acmewire']));
  expect(blockedPublisherIssue({ html: '<p>See deskpicks.co.uk for the call.</p>' })).toMatch(/deskpicks/);

  const blocked = await postBrief(post('briefs', { ...BRIEF, html: '<p>Desk Picks says the backstop is live.</p>' }));
  expect(blocked.status).toBe(422);
  expect(await db.select().from(briefs)).toHaveLength(0);

  const clean = sanitizePublicBriefText('Talk of an official backstop, per Desk Picks.');
  expect(clean.toLowerCase()).not.toContain('desk picks');
  expect(clean.toLowerCase()).not.toContain('deskpicks');
  const html = sanitizePublicBriefHtml(
    '<p>Talk of an official backstop. <a href="https://deskpicks.co.uk/p/note">the note</a></p><p>The two-year rose.</p>',
  );
  expect(html.toLowerCase()).not.toContain('deskpicks');
  expect(html).toContain('The two-year rose.');
});

it('redacts a stored publisher name at render time', () => {
  expect(sanitizePublicBriefText('Markets per Northwire').toLowerCase()).not.toContain('northwire');
  expect(sanitizePublicBriefText('Markets per Northwire')).toContain('[redacted source]');
});
