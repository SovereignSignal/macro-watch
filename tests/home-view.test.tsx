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
  expect(markup).toContain('$6.73T');
  expect(markup).toContain('$0.17B');
  expect(markup).toContain('263 bp');
  expect(markup).toContain('Change (7d)');
  expect(markup).toContain('+0.60%');
  expect(markup).not.toContain('+0.60% (7d)');
  expect(markup).not.toContain('(as of 2026-08-29)');
  expect(markup).toContain('as of 8/29');
  expect(markup).toContain('dateTime="2026-08-29"');
  expect(markup).not.toContain('6730912');
});

it('shows 1-day and 1-week changes when ingest provides them and omits the columns otherwise', () => {
  const withChanges = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={{
        takenAt: '2026-09-29T14:00:00Z',
        rows: [
          { label: '2y UST', value: '4.92%', change: null, note: null, change1d: '+11bp', change1w: '+15bp' },
          { label: 'HY Spread (OAS)', value: '2.63', change: null, note: null, change1w: '-4bp' },
          { label: 'S&P 500 (SPY)', value: '769.35', change: '+0.60%', note: null },
        ],
      }}
      cards={[]}
    />,
  );
  expect(withChanges).toContain('>1-day<');
  expect(withChanges).toContain('>1-week<');
  expect(withChanges).toContain('+11bp');
  expect(withChanges).toContain('+15bp');
  expect(withChanges).toContain('-4bp');
  expect(withChanges).toContain('263 bp');
  expect(withChanges).toContain('+0.60%');
  expect(withChanges).toContain('change-up');
  expect(withChanges).toContain('change-down');

  const without = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={{
        takenAt: '2026-09-29T14:00:00Z',
        rows: [{ label: '2y UST', value: '4.92%', change: null, note: null }],
      }}
      cards={[]}
    />,
  );
  expect(without).toContain('4.92%');
  expect(without).not.toContain('1-day');
  expect(without).not.toContain('1-week');
});

it('shows a subtle as-of or close mark when a dashboard row carries one', () => {
  const markup = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={{
        takenAt: '2026-10-01T14:14:00Z',
        rows: [
          { label: 'ES', value: '6412', change: '+0.1%', note: null, asOf: '2026-10-01T14:14:00Z', quoteKind: 'intraday' },
          { label: '2y UST', value: '4.89%', change: null, note: null, asOf: '2026-09-29', quoteKind: 'close' },
          { label: 'DXY', value: '99.1', change: null, note: null },
        ],
      }}
      cards={[]}
    />,
  );
  expect(markup).toContain('as of 14:14 UTC');
  expect(markup).toContain('dateTime="2026-10-01T14:14:00.000Z"');
  expect(markup).toContain('close 9/29');
  expect(markup).toContain('dateTime="2026-09-29"');
  expect(markup).toContain('<td class="num">99.1</td>');
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
  expect(markup).toContain('dateTime="2026-07-11T12:00:00.000Z"');
  expect(markup).not.toContain('quote-freshness');
});

it('renders the prediction market lens as a distinct homepage panel', () => {
  const markup = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={null}
      oddsPanel={{
        takenAt: '2026-07-21T16:20:12Z',
        summary: '8 markets from 53 tracked-wallet signals',
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
  expect(markup).toContain('8 markets from 53 tracked-wallet signals');
  expect(markup).not.toMatch(/schema|\bv2\b|AMS/i);
  expect(markup).toContain('Will the U.S. invade Iran before 2027?');
  expect(markup).toContain('No 74%');
  expect(markup).toContain('+$32K net (24h)');
  expect(markup).toContain('current evidence not assessed');
  expect(markup).toContain('<caption class="sr-only">Prediction Market Lens</caption>');
  expect(markup).toContain('<th scope="col">Market</th>');
  expect(markup).toContain('<th scope="col" class="num-head">Odds</th>');
  expect(markup).toContain('<th scope="col" class="num-head">24-hour flow</th>');
  expect(markup).toContain('<th scope="row">Will the U.S. invade Iran before 2027?');
});

it('marks a stale odds quote as delayed and hides internal taxonomy notes', () => {
  const markup = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={null}
      oddsPanel={{
        takenAt: '2026-10-02T18:12:00Z',
        summary: '8 markets from 53 tracked-wallet signals',
        rows: [{
          label: 'Bitcoin above 90k',
          value: '42%',
          change: '+1pp',
          note: 'Data-anchored taxonomy',
          asOf: '2026-10-02T06:20:00Z',
          quoteKind: 'intraday',
        }],
      }}
      cards={[]}
    />,
  );
  expect(markup).toContain('quote-delayed');
  expect(markup).toContain('delayed, as of 06:20 UTC');
  expect(markup).not.toContain('taxonomy');
  expect(markup).not.toContain('schema');
});

it('renders explicit empty states when nothing is published', () => {
  const markup = renderToStaticMarkup(<HomeView brief={null} panel={null} cards={[]} />);
  expect(markup).toContain('No brief yet');
  expect(markup).toContain('14:00 UTC');
  expect(markup).toContain('17:00 UTC');
  expect(markup).toContain('23:00 UTC');
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

it('keeps dormant candidates off the home strip when an as-of date is given', () => {
  const card = (slug: string, status: string, lastEventAt: string) => ({
    slug,
    name: slug,
    description: 'd',
    status,
    firstSeen: '2026-01-05',
    lastEventAt,
    conviction: null,
    read: null,
    triggers: [],
    raiseConditions: [],
    lowerConditions: [],
  });
  const cards = [
    card('fresh-candidate', 'candidate', '2026-08-20'),
    card('stale-candidate', 'candidate', '2026-07-01'),
    card('quiet-active', 'active', '2026-05-01'),
  ];
  const withAsOf = renderToStaticMarkup(<HomeView brief={null} panel={null} cards={cards} asOf="2026-09-02" />);
  expect(withAsOf).toContain('fresh-candidate');
  expect(withAsOf).toContain('quiet-active');
  expect(withAsOf).not.toContain('stale-candidate');
  const withoutAsOf = renderToStaticMarkup(<HomeView brief={null} panel={null} cards={cards} />);
  expect(withoutAsOf).toContain('stale-candidate');
});
