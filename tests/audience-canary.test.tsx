import { eq } from 'drizzle-orm';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HomeView } from '@/components/HomeView';
import { themeEvents } from '@/db/schema';
import { upsertBrief } from '@/lib/ingest/briefs';
import type { PanelRowItem } from '@/lib/panel-contract';
import { listBriefs, listBriefsForDate, PUBLIC_BRIEF_MIN_DATE } from '@/lib/queries/briefs';
import { buildFeed } from '@/lib/rss';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const session = vi.hoisted(() => ({ member: false }));

vi.mock('@/lib/member-session', () => ({
  isMember: async () => session.member,
}));

const { default: BriefKindPage } = await import('@/app/briefs/[date]/[kind]/page');
const { default: BriefPage } = await import('@/app/briefs/[date]/page');
const { default: SearchPage } = await import('@/app/search/page');
const { default: ThemePage } = await import('@/app/map/[theme]/page');

const DATE = '2026-09-15';
const THEME = 'rate-path-repricing';
const CANARY = 'CANARYWALLET 4242 wallets deployed $9.9M behind No.';
const PUBLIC_LINE = 'Copper stocks fell for a third week.';
const HTML =
  `<p>${PUBLIC_LINE}</p><p>${CANARY}</p>` +
  '<p>Wallet-convergence read, market structure and external checkability.</p>' +
  '<table><thead><tr><th>Market</th><th>Odds</th><th>Smart money</th></tr></thead>' +
  '<tbody><tr><td>Copper above $5</td><td>40%</td><td>CANARYCELL $1K · 3 wallets</td></tr></tbody></table>';

const FORBIDDEN = [/CANARYWALLET/, /CANARYCELL/, /CANARYFLOW/, /tracked-wallet/i, /\bwallets?\b/i];

function expectNoLeak(markup: string) {
  for (const re of FORBIDDEN) expect(markup).not.toMatch(re);
}

function expectPublic(markup: string) {
  expectNoLeak(markup);
  expect(markup).toContain('Copper stocks fell');
}

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
  await seedAll(db);
  expect(DATE > PUBLIC_BRIEF_MIN_DATE).toBe(true);
  await upsertBrief(db, {
    date: DATE,
    kind: 'daily',
    subject: 'Copper weekly',
    telegram_ping: `${PUBLIC_LINE} ${CANARY}`,
    html: HTML,
    sent_verified_at: `${DATE}T14:00:00Z`,
  });
  await db
    .update(themeEvents)
    .set({ evidence: `${PUBLIC_LINE} ${CANARY}` })
    .where(eq(themeEvents.themeSlug, THEME));
});

beforeEach(() => {
  session.member = false;
});

const brief = () => listBriefsForDate(db, DATE).then((rows) => rows[0]);

it('brief permalink hides smart money from logged-out visitors', async () => {
  const markup = renderToStaticMarkup(
    await BriefKindPage({ params: Promise.resolve({ date: DATE, kind: 'daily' }) }),
  );
  expectPublic(markup);
});

it('/briefs/[date] hides smart money from logged-out visitors', async () => {
  const markup = renderToStaticMarkup(await BriefPage({ params: Promise.resolve({ date: DATE }) }));
  expectPublic(markup);
});

it('home odds panel hides summary and flow column when logged out', async () => {
  const props = {
    brief: await brief(),
    panel: null,
    oddsPanel: {
      takenAt: `${DATE}T14:00:00Z`,
      summary: '8 markets from 48 tracked-wallet signals',
      rows: [
        { label: 'Copper above $5', value: '40%', note: 'CANARYFLOW +$8K', change: 'CANARYFLOW +$8K' },
      ] as unknown as PanelRowItem[],
    },
    cards: [],
  };
  expectPublic(renderToStaticMarkup(<HomeView {...props} />));
  expect(renderToStaticMarkup(<HomeView {...props} member />)).toContain('48 tracked-wallet signals');
});

it('search hides smart money from logged-out visitors', async () => {
  const copper = renderToStaticMarkup(
    await SearchPage({ searchParams: Promise.resolve({ q: 'copper' }) }),
  );
  expectPublic(copper);
  const wallets = renderToStaticMarkup(
    await SearchPage({ searchParams: Promise.resolve({ q: 'wallets' }) }),
  );
  expectNoLeak(wallets);
});

it('/map/[theme] hides smart money from logged-out visitors', async () => {
  const markup = renderToStaticMarkup(await ThemePage({ params: Promise.resolve({ theme: THEME }) }));
  expectPublic(markup);
});

it('RSS is always public', async () => {
  const feed = buildFeed(await listBriefs(db, { limit: 50 }));
  expectPublic(feed);
});

it('members still see the smart-money text (gated, not deleted)', async () => {
  session.member = true;
  const markup = renderToStaticMarkup(
    await BriefKindPage({ params: Promise.resolve({ date: DATE, kind: 'daily' }) }),
  );
  expect(markup).toContain('CANARYWALLET');
  expect(markup).toContain('Copper stocks fell');
});
