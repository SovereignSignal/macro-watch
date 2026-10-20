import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BriefArticle } from '@/components/BriefArticle';
import { briefs, forwardEvents, themeEvents, themes, themeState } from '@/db/schema';
import {
  blockedPublisherTerms,
  isBlockedPublisherHost,
  mentionsBlockedPublisher,
  redactBlockedPublisherText,
} from '@/lib/security/blocked-publishers';
import { createTestDb } from './helpers/db';

vi.mock('@/lib/member-session', () => ({ isMember: async () => false }));

const { default: MapPage } = await import('@/app/map/page');
const { default: ThemePage } = await import('@/app/map/[theme]/page');
const { default: CatalystsPage } = await import('@/app/catalysts/page');
const { default: SearchPage } = await import('@/app/search/page');
const { default: AboutPage } = await import('@/app/about/page');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PAID = new RegExp(blockedPublisherTerms().map(escapeRegExp).join('|'), 'i');
const NORTHWIRE = /northwire/i;

function expectNoPaidSource(html: string) {
  expect(html).not.toMatch(PAID);
  expect(html).not.toMatch(NORTHWIRE);
}

describe('public pages never render paid-source text', () => {
  const pages: Record<string, string> = {};
  let briefHtml = '';

  beforeAll(async () => {
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
        triggerState: 'Copper stocks below the monthly average.',
        nextCheck: 'Weekly copper inventory report.',
        source: 'daily',
      },
      {
        eventId: 'te-leak',
        date: '2026-09-28',
        themeSlug: 'copper-demand',
        direction: 'raise',
        evidence:
          'Copper cargoes moved covertly. Northwire reported cargoes moving covertly, per Ledger Lines, The Halvorsen argued it https://www.northwire.com/news/copper and Ledgerweek agreed.',
        triggerState: 'Copper trigger per Ledger Lines and Northwire.',
        nextCheck: 'Check copper again via https://www.northwire.com/news/next and The Halvorsen.',
        source: 'daily',
      },
    ]);
    await db.insert(themeState).values({
      takenAt: new Date('2026-09-29T12:00:00Z'),
      payload: {
        last_event_date: '2026-09-29',
        themes: [
          {
            slug: 'copper-demand',
            name: 'Copper demand',
            description: 'Copper demand per Ledger Lines and Northwire Ledgerweek.',
            current_read: 'Copper stocks keep drawing. Northwire reported cargoes moving covertly.',
            conviction: 'medium',
            status: 'active',
            raise_conditions: ['Exchange stocks fall again', 'The Halvorsen argued stocks will fall'],
            lower_conditions: ['Ledger Lines says demand fades', 'Stocks rebuild'],
            triggers: [
              { name: 'LME stocks', state: 'live' },
              { name: 'Northwire copper screen', state: 'Ledger Lines watching' },
            ],
          },
        ],
      },
    });
    await db.insert(forwardEvents).values([
      {
        eventId: 'fe-clean',
        eventDate: '2099-01-15',
        payload: {
          event: 'Core CPI release',
          expectation: 'Core prints near consensus.',
          surprise: 'A hot print would move the front end.',
        },
        resolution: null,
      },
      {
        eventId: 'fe-leak',
        eventDate: '2099-01-20',
        payload: {
          event: 'Copper auction, Northwire reported cargoes moving covertly',
          expectation: 'Per Ledger Lines the auction clears.',
          surprise: 'The Halvorsen argued a miss is likely.',
          source_title: 'Northwire copper note',
          source_url: 'https://www.northwire.com/news/articles/copper',
        },
        resolution: null,
      },
      {
        eventId: 'fe-resolved',
        eventDate: '2026-01-05',
        payload: {
          event: 'Payrolls release',
          expectation: 'Steady hiring.',
          surprise: 'Under 50k.',
        },
        resolution: {
          outcome: 'Northwire reported a strong print, per Ledger Lines.',
          resolved_at: '2026-01-06',
          note: 'The Halvorsen argued the print was noisy. See https://www.northwire.com/news/payrolls',
        },
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
        subject: 'Copper per Ledger Lines and Northwire',
        ping: 'Northwire reported cargoes moving covertly.',
        html: '<p>Copper wire. <a href="https://www.northwire.com/news/copper">Northwire</a> Ledger Lines The Halvorsen argued.</p>',
        sentVerifiedAt: new Date('2026-09-28T14:00:00Z'),
      },
    ]);

    pages.map = renderToStaticMarkup(await MapPage());
    pages.theme = renderToStaticMarkup(
      await ThemePage({ params: Promise.resolve({ theme: 'copper-demand' }) }),
    );
    pages.catalysts = renderToStaticMarkup(await CatalystsPage());
    pages.search = renderToStaticMarkup(
      await SearchPage({ searchParams: Promise.resolve({ q: 'copper' }) }),
    );
    pages.about = renderToStaticMarkup(<AboutPage />);
    briefHtml = renderToStaticMarkup(
      <BriefArticle
        brief={{
          date: '2026-09-28',
          kind: 'daily',
          subject: 'Copper wire',
          html: '<p>Copper wire. <a href="https://www.northwire.com/news/copper">Northwire</a> Ledger Lines The Halvorsen argued.</p><p>The two-year rose.</p>',
        }}
      />,
    );
  });

  it('keeps paid-source text off /map', () => {
    expect(pages.map).toContain('Copper demand');
    expectNoPaidSource(pages.map);
  });

  it('keeps paid-source text off /map/[theme]', () => {
    expect(pages.theme).toContain('Exchange copper stocks fell and the public tape held.');
    expectNoPaidSource(pages.theme);
  });

  it('keeps paid-source text off /catalysts', () => {
    expect(pages.catalysts).toContain('Core CPI release');
    expect(pages.catalysts).toContain('Payrolls release');
    expectNoPaidSource(pages.catalysts);
  });

  it('keeps paid-source text off /search', () => {
    expect(pages.search).toContain('Copper demand in the public record');
    expectNoPaidSource(pages.search);
  });

  it('keeps paid-source text off /about and does not name a paid publisher', () => {
    expect(pages.about).toContain('About Sovs Macro');
    expect(pages.about).toContain('paid or licensed sources is not used');
    expectNoPaidSource(pages.about);
  });

  it('strips paid-source blocks from a rendered brief', () => {
    expect(briefHtml).toContain('The two-year rose.');
    expectNoPaidSource(briefHtml);
  });
});

describe('blocked publisher terms', () => {
  it('includes the Northwire-owned newsletter names', () => {
    const terms = blockedPublisherTerms();
    expect(terms).toContain('ledger lines');
    expect(terms).toContain('ledgerweek');
    expect(terms).toContain('northwire');
  });

  it('flags Ledger Lines and Ledgerweek without the word Northwire', () => {
    expect(mentionsBlockedPublisher('Ledger Lines says')).toBe(true);
    expect(mentionsBlockedPublisher('per LEDGER LINES today')).toBe(true);
    expect(mentionsBlockedPublisher('Ledgerweek reported it')).toBe(true);
    expect(isBlockedPublisherHost('www.ledgerweek.com')).toBe(true);
  });

  it('does not flag ordinary text', () => {
    expect(mentionsBlockedPublisher('Stuff about money and the economy')).toBe(false);
    expect(mentionsBlockedPublisher('Halvorsens expect a hold')).toBe(false);
  });

  it('redacts the new terms from stored text', () => {
    const out = redactBlockedPublisherText('Ledger Lines says copper rose. Ledgerweek agreed.');
    expect(out).not.toMatch(/ledger lines/i);
    expect(out).not.toMatch(/ledgerweek/i);
    expect(out).toContain('copper rose');
    expect(out).toContain('[redacted source]');
  });
});
