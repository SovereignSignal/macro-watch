import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { ThemeGrid } from '@/components/ThemeGrid';
import { upsertClaims } from '@/lib/ingest/claims';
import { upsertThemeEvents, upsertThemeState } from '@/lib/ingest/themes';
import { getThemeDetail, getThemeMapCards, type ThemeCard } from '@/lib/queries/map';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const session = vi.hoisted(() => ({ member: true }));

// next/headers cookies() fails outside a request, so stub the session.
vi.mock('@/lib/member-session', () => ({
  isMember: async () => session.member,
}));

const { default: MapPage } = await import('@/app/map/page');
const { default: ThemePage, generateMetadata } = await import('@/app/map/[theme]/page');

beforeEach(() => {
  session.member = true;
});

it('getThemeDetail assembles card, timeline, related claims, conviction series', async () => {
  const db = await createTestDb();
  await seedAll(db);
  // Second, earlier snapshot so the conviction series has two points.
  await upsertThemeState(db, {
    taken_at: '2026-07-04T12:10:00Z',
    payload: {
      themes: [
        { slug: 'rate-path-repricing', name: 'Rate-path repricing', conviction: 'medium' },
      ],
    },
  });
  const detail = await getThemeDetail(db, 'rate-path-repricing');
  expect(detail).not.toBeNull();
  expect(detail?.name).toBe('Rate-path repricing');
  expect(detail?.status).toBe('active');
  expect(detail?.events.map((e) => e.eventId)).toEqual([
    'te-2026-07-08-rate-path-1',
    'te-2026-06-24-rate-path-1',
    'te-2026-06-20-rate-path-1',
  ]); // newest first
  expect(detail?.relatedClaims.map((c) => c.claimId).sort()).toEqual([
    'cl-2026-06-05-rates-2',
    'cl-2026-06-24-rates-1',
  ]);
  expect(detail?.conviction).toEqual([
    { takenAt: '2026-07-04T12:10:00.000Z', level: 2 },
    { takenAt: '2026-07-11T12:10:00.000Z', level: 3 },
  ]); // chronological
});

it('getThemeDetail returns null for an unknown slug', async () => {
  const db = await createTestDb();
  await seedAll(db);
  expect(await getThemeDetail(db, 'no-such-theme')).toBeNull();
});

it('/map renders the grid grouped by lifecycle with a freshness badge', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await MapPage());
  expect(markup).toContain('Theme map');
  expect(markup).toContain('Rate-path repricing');
  expect(markup).toContain('expected path of policy rates');
  expect(markup).toContain('Dollar downtrend');
  expect(markup).toContain('Retired'); // section for china-reflation
  expect(markup).toContain('China reflation');
  expect(markup).toContain('conv-high');
  expect(markup).toContain('updated 11 Jul 12:10 UTC');
  expect(markup).toContain('dateTime="2026-07-11T12:10:00.000Z"');
  // Trigger rows on cards: name + freshness chip (instrument-panel layout).
  expect(markup).toContain('2y auction demand');
  expect(markup).toContain('chip-live');
});

it('/map renders an empty state with no data', async () => {
  await createTestDb();
  const markup = renderToStaticMarkup(await MapPage());
  expect(markup).toContain('No themes yet.');
  expect(markup).not.toContain('The field'); // no broken hero either
});

it('/map renders the field hero above the grid, nodes linked to dossiers', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await MapPage());
  expect(markup).toContain('Where themes stand');
  expect(markup).toContain('High conviction sits at the top');
  expect(markup).toContain('Lowered');
  expect(markup).toContain('Raised');
  expect(markup).toContain('field-node');
  expect(markup).toContain('href="/map/rate-path-repricing"'); // SVG node link
  expect(markup).toContain('Retired'); // china-reflation pins to the shelf
  expect(markup.indexOf('the-field')).toBeLessThan(markup.indexOf('theme-grid'));
});

it('/map/[theme] renders the full dossier with brief-linked timeline', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'rate-path-repricing' }) }),
  );
  expect(markup).toContain('Rate-path repricing');
  expect(markup).toContain('expected path of policy rates');
  expect(markup).toContain('underpricing how slow the cutting cycle gets');
  expect(markup).toContain('Core CPI re-accelerates above 0.3% m/m'); // raise condition
  expect(markup).toContain('href="/briefs/2026-07-08"'); // event linked to source brief
  expect(markup).toContain('dir-raise');
  expect(markup).toContain('dir-candidate');
  expect(markup).toContain('2y UST closes above 4.40%'); // related claim (member view)
  expect(markup).toContain('Two snapshots are needed.'); // 1 snapshot only
});

it('/map/[theme] replaces related claims with a members-only notice for logged-out visitors', async () => {
  const db = await createTestDb();
  await seedAll(db);
  session.member = false;
  const markup = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'rate-path-repricing' }) }),
  );
  // The rest of the dossier stays public.
  expect(markup).toContain('Rate-path repricing');
  expect(markup).toContain('Core CPI re-accelerates above 0.3% m/m');
  expect(markup).toContain('Related claims');
  expect(markup).toContain('Related claims are available to members.');
  expect(markup).not.toContain('2y UST closes above 4.40%');
  expect(markup).not.toContain('No claims reference this theme yet.');
});

it('/map/[theme] publishes its own canonical and Open Graph URL', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const metadata = await generateMetadata({
    params: Promise.resolve({ theme: 'rate-path-repricing' }),
  });
  expect(metadata.alternates?.canonical).toBe('/map/rate-path-repricing');
  expect(metadata.openGraph?.url).toBe('/map/rate-path-repricing');
});

it('/map/[theme] 404s for an unknown slug', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await expect(ThemePage({ params: Promise.resolve({ theme: 'nope' }) })).rejects.toThrow();
});

// --- dormant candidates ---------------------------------------------------------

function card(slug: string, over: Partial<ThemeCard> = {}): ThemeCard {
  return {
    slug,
    name: slug,
    description: `Tracks ${slug}.`,
    status: 'active',
    firstSeen: null,
    lastEventAt: null,
    conviction: 'medium',
    read: null,
    triggers: [],
    raiseConditions: [],
    lowerConditions: [],
    ...over,
  };
}

it('ThemeGrid folds a stale candidate into a collapsed Dormant section, out of Candidates', () => {
  const markup = renderToStaticMarkup(
    <ThemeGrid
      cards={[
        card('live-theme', { lastEventAt: '2026-08-30' }),
        card('fresh-idea', { status: 'candidate', lastEventAt: '2026-08-20' }),
        card('stale-idea', { status: 'candidate', lastEventAt: '2026-06-01' }),
        card('gone', { status: 'retired', lastEventAt: '2026-05-01' }),
      ]}
      asOf="2026-09-01"
    />,
  );
  const [above, rest] = markup.split('<details');
  expect(above).toContain('Active <span class="section-count">1</span>');
  expect(above).toContain('Candidates <span class="section-count">1</span>');
  expect(above).toContain('href="/map/fresh-idea"');
  expect(above).not.toContain('stale-idea');
  const [fold, below] = rest.split('</details>');
  expect(fold).toContain('Dormant (1): candidates with no event for 45+ days');
  expect(fold).toContain('href="/map/stale-idea"');
  expect(fold).toContain('badge-dormant');
  expect(fold).toContain('>dormant<');
  expect(fold).not.toContain('badge-candidate');
  expect(below).toContain('Retired <span class="section-count">1</span>');
  expect(markup).not.toContain('<details open'); // folded shut by default
});

it('ThemeGrid keeps a live candidate in Candidates and shows no Dormant fold', () => {
  const markup = renderToStaticMarkup(
    <ThemeGrid
      cards={[card('a'), card('idea', { status: 'candidate', lastEventAt: '2026-07-18' })]}
      asOf="2026-09-01"
    />,
  );
  expect(markup).toContain('Candidates <span class="section-count">1</span>');
  expect(markup).toContain('badge-candidate');
  expect(markup).not.toContain('Dormant');
  expect(markup).not.toContain('<details');
});

// The pages read as-of from today's date. A candidate flagged in January 2026
// is dormant on every date from mid-February 2026 on, so these hold for any
// present or future run.
const STALE_CANDIDATE = {
  event_id: 'te-2026-01-05-stale-1',
  date: '2026-01-05',
  theme_slug: 'stale-idea',
  theme_name: 'Stale idea',
  direction: 'candidate' as const,
  evidence: 'Flagged once in January and never followed up.',
  source: 'weekly' as const,
};

it('/map keeps a stale candidate off the field and inside the Dormant fold', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await upsertThemeEvents(db, [STALE_CANDIDATE]);
  const markup = renderToStaticMarkup(await MapPage());
  const field = markup.slice(0, markup.indexOf('theme-grid'));
  expect(field).toContain('href="/map/rate-path-repricing"');
  expect(field).not.toContain('stale-idea');
  expect(markup).toContain('Dormant (1): candidates with no event for 45+ days');
  expect(markup).toContain('href="/map/stale-idea"');
});

it('hides a duplicate theme and folds its events into the canonical dossier', async () => {
  const db = await createTestDb();
  await upsertThemeEvents(db, [
    {
      event_id: 'te-gold-alias',
      date: '2026-07-02',
      theme_slug: 'gold-and-silver',
      theme_name: 'Gold and silver',
      direction: 'raise',
      evidence: 'The older gold name was raised on the metals bid.',
      source: 'weekly',
    },
    {
      event_id: 'te-gold-canonical',
      date: '2026-07-09',
      theme_slug: 'gold-miners-real-assets',
      theme_name: 'Gold / miners / real assets',
      direction: 'hold',
      evidence: 'The standing gold theme held.',
      source: 'daily',
    },
  ]);
  await upsertClaims(db, [{
    claim_id: 'cl-gold-alias',
    kind: 'map',
    themes: ['gold-and-silver'],
    predicate: 'Miners hold the breakout through July.',
    opened_at: '2026-07-02',
    status: 'pending',
  }]);
  const { cards } = await getThemeMapCards(db);
  expect(cards.map((card) => card.slug)).not.toContain('gold-and-silver');
  expect(cards.map((card) => card.slug)).toContain('gold-miners-real-assets');
  const detail = await getThemeDetail(db, 'gold-miners-real-assets');
  expect(detail?.events.map((event) => event.eventId)).toEqual(['te-gold-canonical', 'te-gold-alias']);
  expect(detail?.relatedClaims.map((claim) => claim.claimId)).toContain('cl-gold-alias');
  const markup = renderToStaticMarkup(await MapPage());
  expect(markup).toContain('href="/map/gold-miners-real-assets"');
  expect(markup).not.toContain('href="/map/gold-and-silver"');
  await expect(ThemePage({ params: Promise.resolve({ theme: 'gold-and-silver' }) })).rejects.toMatchObject({
    digest: 'NEXT_REDIRECT;replace;/map/gold-miners-real-assets;308;',
  });
});

it('/map/[theme] badges a stale candidate as dormant', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await upsertThemeEvents(db, [STALE_CANDIDATE]);
  const markup = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'stale-idea' }) }),
  );
  expect(markup).toContain('Stale idea');
  expect(markup).toContain('badge-dormant');
  expect(markup).not.toContain('badge-candidate');
});
