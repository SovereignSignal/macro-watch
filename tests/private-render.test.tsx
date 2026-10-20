import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { BriefArticle } from '@/components/BriefArticle';
import { briefs, claims, researchMemos, themeEvents, themes, themeState } from '@/db/schema';
import { searchAll } from '@/lib/queries/search';
import { createTestDb } from './helpers/db';

vi.mock('@/lib/member-session', () => ({ isMember: async () => true }));

const { default: MapPage } = await import('@/app/map/page');
const { default: ThemePage } = await import('@/app/map/[theme]/page');
const { default: SearchPage } = await import('@/app/search/page');

const PRIVATE = /northwire|cv101|corvina|deskpicks|halvorsen|dp research|desk-only/i;

it('does not render private outlets on the map, in search, or in a brief', async () => {
  const db = await createTestDb();
  await db.insert(themes).values({
    slug: 'copper-demand',
    name: 'Copper demand',
    status: 'active',
    firstSeen: '2026-09-28',
    lastEventAt: '2026-09-29',
  });
  await db.insert(themeEvents).values([
    {
      eventId: 'te-clean',
      date: '2026-09-29',
      themeSlug: 'copper-demand',
      direction: 'hold',
      evidence: 'Exchange copper stocks fell and the public tape held.',
      source: 'daily',
    },
    {
      eventId: 'te-leak',
      date: '2026-09-28',
      themeSlug: 'copper-demand',
      direction: 'raise',
      evidence: 'Desk-only copper call from Corvina https://cv101.substack.com/p/note Northwire https://www.northwire.com/news Halvorsen https://www.halvorsen.com/finance deskpicks https://deskpicks.co.uk/p/x and Dp Research.',
      source: 'daily',
    },
  ]);
  await db.insert(themeState).values({
    takenAt: new Date('2026-09-29T12:00:00Z'),
    payload: {
      last_event_date: '2026-09-29',
      themes: [{
        slug: 'copper-demand',
        name: 'Copper demand',
        current_read: 'Private tape: Northwire, The Halvorsen, Corvina, and https://cv101.substack.com/p/note.',
        conviction: 'medium',
        status: 'active',
      }],
    },
  });
  await db.insert(claims).values([
    {
      claimId: 'cl-clean',
      kind: 'map',
      themes: ['copper-demand'],
      payload: { predicate: 'Copper exchange stocks stay below last month' },
      status: 'pending',
      openedAt: '2026-09-29',
    },
    {
      claimId: 'cl-leak',
      kind: 'map',
      themes: ['copper-demand'],
      payload: { predicate: 'Desk-only copper claim via Northwire https://cv101.substack.com/p/note' },
      status: 'pending',
      openedAt: '2026-09-28',
    },
  ]);
  await db.insert(briefs).values([
    {
      date: '2026-09-29',
      kind: 'daily',
      subject: 'Copper demand in the public record',
      ping: 'Exchange stocks fell.',
      html: '<p>Copper demand held on the exchange.</p>',
      sentVerifiedAt: new Date('2026-09-29T14:00:00Z'),
    },
    {
      date: '2026-09-28',
      kind: 'daily',
      subject: 'Copper tape stays public',
      ping: 'A public copper note.',
      html: '<p>Desk-only wire. <a href="https://cv101.substack.com/p/note">Corvina</a> <a href="https://www.northwire.com/news">Northwire</a> <a href="https://www.halvorsen.com/finance">Halvorsen</a> <a href="https://deskpicks.co.uk/p/x">Dp Research</a></p>',
      sentVerifiedAt: new Date('2026-09-28T14:00:00Z'),
    },
  ]);
  await db.insert(researchMemos).values({
    date: '2026-09-28',
    topic: 'Copper and a private wire',
    finding: 'Copper demand is the public question.',
    changed: 'No change.',
    decision: 'No action.',
    watch: 'Stocks.',
    citations: [{ url: 'https://www.halvorsen.com/finance', title: 'Wire' }],
    generatedAt: new Date('2026-09-28T15:00:00Z'),
  });

  const map = renderToStaticMarkup(await MapPage());
  const theme = renderToStaticMarkup(await ThemePage({ params: Promise.resolve({ theme: 'copper-demand' }) }));
  const search = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ q: 'copper' }) }));
  const results = await searchAll(db, 'copper', { includeClaims: true });
  const brief = renderToStaticMarkup(
    <BriefArticle
      brief={{
        date: '2026-09-28',
        kind: 'daily',
        subject: 'Copper tape',
        html: '<p>Desk-only wire. <a href="https://cv101.substack.com/p/note">Corvina</a> <a href="https://www.northwire.com/news">Northwire</a> <a href="https://www.halvorsen.com/finance">Halvorsen</a> <a href="https://deskpicks.co.uk/p/x">Dp Research</a></p><p>The two-year rose.</p>',
      }}
    />,
  );

  expect(map).toContain('Copper demand');
  expect(map).not.toMatch(PRIVATE);
  expect(theme).toContain('Exchange copper stocks fell and the public tape held.');
  expect(theme).toContain('Copper exchange stocks stay below last month');
  expect(theme).not.toMatch(PRIVATE);
  expect(search).toContain('Copper demand in the public record');
  expect(search).not.toContain('Copper tape stays public');
  expect(search).not.toMatch(PRIVATE);
  expect(results.map((result) => result.title)).toEqual(expect.arrayContaining([
    'Copper demand in the public record',
    'copper-demand: hold',
    'Copper exchange stocks stay below last month',
  ]));
  expect(results.map((result) => result.title)).not.toContain('Copper tape stays public');
  expect(results.map((result) => result.title)).not.toContain('Copper and a private wire');
  expect(JSON.stringify(results)).not.toMatch(PRIVATE);
  expect(brief).toContain('The two-year rose.');
  expect(brief).not.toMatch(PRIVATE);
});
