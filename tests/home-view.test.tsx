import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { HomeView } from '@/components/HomeView';
import type { BriefRow } from '@/lib/queries/briefs';

const BRIEF: BriefRow = {
  date: '2026-07-11',
  kind: 'weekend',
  subject: 'Weekend review: what the map got right about the dollar',
  ping: 'The dollar downtrend theme aged well this week.',
  html: '<h2>The week in themes</h2><p>DXY closed below its June range.</p>',
  sentVerifiedAt: new Date('2026-07-11T12:02:33Z'),
  ingestedAt: new Date('2026-07-11T12:03:00Z'),
  search: '',
};

it('renders the brief in full with the weekend label', () => {
  const markup = renderToStaticMarkup(<HomeView brief={BRIEF} panel={null} cards={[]} />);
  expect(markup).toContain('Weekend review: what the map got right about the dollar');
  expect(markup).toContain('DXY closed below its June range.');
  expect(markup).toContain('Weekend review'); // badge
  expect(markup).toContain('July 11, 2026');
});

it('renders panel rows with change coloring', () => {
  const markup = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={{
        takenAt: '2026-07-11T12:00:00Z',
        rows: [
          { label: 'ES', value: '6,412.50', change: '+0.4%', note: null },
          { label: 'DXY', value: '95.84', change: '-0.3%', note: null },
        ],
      }}
      cards={[]}
    />,
  );
  expect(markup).toContain('ES');
  expect(markup).toContain('change-up');
  expect(markup).toContain('change-down');
  expect(markup).toContain('updated —'); // UpdatedAgo pre-hydration placeholder
});

it('renders explicit empty states when nothing is published', () => {
  const markup = renderToStaticMarkup(<HomeView brief={null} panel={null} cards={[]} />);
  expect(markup).toContain('No brief published yet');
  expect(markup).toContain('No data yet');
  expect(markup).toContain('No themes on the map yet');
});

it('links theme strip entries to their theme pages', () => {
  const markup = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={null}
      cards={[
        {
          slug: 'rate-path-repricing',
          name: 'Rate-path repricing',
          status: 'active',
          firstSeen: '2026-06-20',
          lastEventAt: '2026-07-08',
          conviction: 'high',
          read: null,
          triggers: [],
          raiseConditions: [],
          lowerConditions: [],
        },
      ]}
    />,
  );
  expect(markup).toContain('href="/map/rate-path-repricing"');
  expect(markup).toContain('conv-high');
});
