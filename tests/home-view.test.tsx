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

it('strips embedded dashboard and lens sections that the homepage already renders', () => {
  const markup = renderToStaticMarkup(
    <HomeView
      brief={{
        ...BRIEF,
        html: '<h2>Map</h2><p>Gold lowered.</p><h2>5. Prediction Market Lens</h2><div class="prediction-lens"><p>No 97%</p></div><h2>7. Market Snapshot</h2><table><tr><td>SPY</td></tr></table>',
      }}
      panel={{
        takenAt: '2026-07-11T12:00:00Z',
        rows: [{ label: 'S&P 500 (SPY)', value: '769.35', change: '+0.60%', note: null }],
      }}
      cards={[]}
    />,
  );
  expect(markup).toContain('Gold lowered.');
  expect(markup).toContain('SPY (S&amp;P 500 ETF)');
  expect(markup).not.toContain('Prediction Market Lens</h2>');
  expect(markup).not.toContain('Market Snapshot');
});

it('renders the brief in full with the weekend label', () => {
  const markup = renderToStaticMarkup(<HomeView brief={BRIEF} panel={null} cards={[]} />);
  expect(markup).toContain('Weekend review: what the map got right about the dollar');
  expect(markup).toContain('DXY closed below its June range.');
  expect(markup).toContain('Weekend review'); // badge
  expect(markup).toContain('July 11, 2026');
});

it('unitizes dashboard rows that ship with an as-of suffix', () => {
  const markup = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={{
        takenAt: '2026-08-29T17:00:00Z',
        rows: [
          { label: 'S&P 500 (SPY)', value: '769.35 (as of 2026-08-29)', change: '+0.60% (7d)', note: null },
          { label: 'Fed Balance Sheet', value: '6730912.0 (as of 2026-08-29)', change: '-0.22% (7d)', note: null },
          { label: 'Reverse Repo (RRP)', value: '0.17 (as of 2026-08-29)', change: null, note: null },
          { label: 'HY Spread (OAS)', value: '2.63 (as of 2026-08-29)', change: null, note: null },
        ],
      }}
      cards={[]}
    />,
  );
  expect(markup).toContain('SPY (S&amp;P 500 ETF)');
  expect(markup).toContain('$6.73T (as of 2026-08-29)');
  expect(markup).toContain('$0.17B (as of 2026-08-29)');
  expect(markup).toContain('263 bp (as of 2026-08-29)');
  expect(markup).not.toContain('6730912');
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
  expect(markup).toContain('panel-table-scroll');
  expect(markup).toContain('updated 11 Jul 12:00 UTC');
});

it('renders the prediction market lens as a distinct homepage panel', () => {
  const markup = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={null}
      oddsPanel={{
        takenAt: '2026-07-21T16:20:12Z',
        summary: '1 selected from 28 verified schema-v2 AMS signals',
        rows: [{
          label: 'Will the U.S. invade Iran before 2027?',
          value: 'No 74%',
          change: '+$32K net (24h)',
          note: 'tail risk gauge · current evidence not assessed',
        }],
      }}
      cards={[]}
    />,
  );
  expect(markup).toContain('Prediction Market Lens');
  expect(markup).toContain('1 selected from 28 verified schema-v2 AMS signals');
  expect(markup).toContain('Will the U.S. invade Iran before 2027?');
  expect(markup).toContain('No 74%');
  expect(markup).toContain('+$32K net (24h)');
  expect(markup).toContain('current evidence not assessed');
  expect(markup).toContain('<caption class="sr-only">Prediction Market Lens</caption>');
  expect(markup).toContain('<th scope="col">Market</th>');
  expect(markup).toContain('<th scope="col">Odds</th>');
  expect(markup).toContain('<th scope="col">24-hour flow</th>');
  expect(markup).toContain('<th scope="row">Will the U.S. invade Iran before 2027?');
});

it('renders explicit empty states when nothing is published', () => {
  const markup = renderToStaticMarkup(<HomeView brief={null} panel={null} cards={[]} />);
  expect(markup).toContain('No brief yet');
  expect(markup).toContain('Waiting for data.');
  expect(markup).toContain('No themes yet.');
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
          description: 'Tracks how incoming data changes the expected path of policy rates.',
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
  expect(markup).toContain('expected path of policy rates');
  expect(markup).toContain('conv-high');
});
