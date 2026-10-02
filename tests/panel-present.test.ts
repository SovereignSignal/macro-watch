import { expect, it } from 'vitest';
import { presentDashboardRows, presentPanelRow, publicOddsNote } from '@/lib/panel-present';

it('relabels ETF tickers and unitizes known dashboard rows', () => {
  expect(
    presentPanelRow({
      label: 'S&P 500 (SPY)',
      value: '769.35',
      change: '+0.60%',
      note: null,
    }),
  ).toEqual({
    label: 'SPY (S&P 500 ETF)',
    value: '769.35',
    change: '+0.60%',
    note: null,
  });
  expect(
    presentPanelRow({
      label: 'Fed Balance Sheet',
      value: '6,730,912.00',
      change: '-0.22%',
      note: 'official',
    }).value,
  ).toBe('$6.73T');
  expect(
    presentPanelRow({
      label: 'HY Spread (OAS)',
      value: '2.63',
      change: '-7bp',
      note: null,
    }).value,
  ).toBe('263 bp');
  expect(
    presentPanelRow({
      label: 'VIX',
      value: '14.43',
      change: '-1.47',
      note: null,
    }).change,
  ).toBe('-1.47 pts');
});

it('unitizes live dashboard values and lifts an as-of suffix into a subtle label', () => {
  expect(presentPanelRow({
    label: 'Fed Balance Sheet',
    value: '6730912.0 (as of 2026-08-29)',
    change: '-0.22% (7d)',
    note: null,
  })).toMatchObject({ value: '$6.73T', freshness: 'as of 8/29', freshnessAt: '2026-08-29' });
  expect(presentPanelRow({
    label: 'Reverse Repo (RRP)',
    value: '0.17 (as of 2026-08-29)',
    change: null,
    note: null,
  })).toMatchObject({ value: '$0.17B', freshness: 'as of 8/29' });
  expect(presentPanelRow({
    label: 'HY Spread (OAS)',
    value: '2.63 (as of 2026-08-29)',
    change: null,
    note: null,
  })).toMatchObject({ value: '263 bp', freshness: 'as of 8/29' });
  expect(presentPanelRow({
    label: 'IG Spread (OAS)',
    value: '0.79 (as of 2026-08-29)',
    change: null,
    note: null,
  })).toMatchObject({ value: '79 bp', freshness: 'as of 8/29' });
  expect(presentPanelRow({
    label: 'S&P 500 (SPY)',
    value: '769.35 (as of 2026-08-29)',
    change: '+0.60% (7d)',
    note: null,
  })).toMatchObject({ value: '769.35', freshness: 'as of 8/29' });
});

it('keeps one 7d column label and a subtle as-of on each homepage value', () => {
  const tape = presentDashboardRows([
    { label: 'Fed Balance Sheet', value: '6730912.0 (as of 2026-08-29)', change: '-0.22% (7d)', note: null },
    { label: 'HY Spread (OAS)', value: '2.63 (as of 2026-08-29)', change: null, note: null },
  ]);
  expect(tape.changeColumn).toBe('Change (7d)');
  expect(tape.rows[0]).toMatchObject({ value: '$6.73T', change: '-0.22%', freshness: 'as of 8/29' });
  expect(tape.rows[1]).toMatchObject({ value: '263 bp', freshness: 'as of 8/29' });
});

it('does not treat month names inside as-of as already-unitized', () => {
  expect(presentPanelRow({
    label: 'Fed Balance Sheet',
    value: '6,730,912.00 (as of August 29, 2026)',
    change: '-0.22%',
    note: null,
  })).toMatchObject({ value: '$6.73T', freshness: 'as of 8/29', freshnessAt: '2026-08-29' });
});

it('shows structured intraday and close marks, and nothing when they are absent', () => {
  expect(presentPanelRow({
    label: 'ES',
    value: '6412',
    change: '+0.1%',
    note: null,
    asOf: '2026-10-01T14:14:00Z',
    quoteKind: 'intraday',
  })).toMatchObject({
    value: '6412',
    freshness: 'as of 14:14 UTC',
    freshnessAt: '2026-10-01T14:14:00.000Z',
  });
  expect(presentPanelRow({
    label: '2y UST',
    value: '4.89%',
    change: null,
    note: null,
    asOf: '2026-09-29',
    quoteKind: 'close',
  })).toMatchObject({ value: '4.89%', freshness: 'close 9/29', freshnessAt: '2026-09-29' });
  expect(presentPanelRow({
    label: '2y UST',
    value: '4.89 (Tue close)',
    change: null,
    note: null,
  })).toMatchObject({ value: '4.89', freshness: 'Tue close' });
  expect(presentPanelRow({
    label: 'DXY',
    value: '99.1',
    change: null,
    note: null,
  })).toEqual({ label: 'DXY', value: '99.1', change: null, note: null });
  expect(presentPanelRow({
    label: 'DXY',
    value: '99.1',
    change: null,
    note: null,
    asOf: 'not-a-date',
  })).toEqual({ label: 'DXY', value: '99.1', change: null, note: null });
});

it('adds 1-day and 1-week columns only when a row has them', () => {
  const tape = presentDashboardRows([
    { label: '2y UST', value: '4.92%', change: null, note: null, change1d: '+11bp', change1w: '+15bp' },
    { label: 'HY Spread (OAS)', value: '3.02', change: null, note: null, change1w: '-7bp' },
    { label: 'S&P 500 (SPY)', value: '769.35', change: '+0.60%', note: null },
  ]);
  expect(tape.horizonColumns).toEqual([
    { key: 'change1d', label: '1-day' },
    { key: 'change1w', label: '1-week' },
  ]);
  expect(tape.rows[0]).toMatchObject({ value: '4.92%', change1d: '+11bp', change1w: '+15bp' });
  expect(tape.rows[1].change1d).toBeUndefined();
  expect(tape.rows[1]).toMatchObject({ value: '302 bp', change1w: '-7bp' });
  expect(tape.rows[2].change1d).toBeUndefined();
  expect(tape.rows[2].change1w).toBeUndefined();

  expect(presentDashboardRows([
    { label: '2y UST', value: '4.92%', change: null, note: null },
  ]).horizonColumns).toEqual([]);
});

it('marks an intraday quote more than two hours older than the panel as delayed', () => {
  const takenAt = '2026-10-02T18:12:00Z';
  const delayed = presentPanelRow({
    label: 'BTC',
    value: '86637',
    change: null,
    note: null,
    asOf: '2026-10-02T06:20:00Z',
    quoteKind: 'intraday',
  }, takenAt);
  expect(delayed.freshness).toBe('delayed, as of 06:20 UTC');
  expect(delayed.delayed).toBe(true);

  const fresh = presentPanelRow({
    label: 'BTC',
    value: '84700',
    change: null,
    note: null,
    asOf: '2026-10-02T18:00:00Z',
    quoteKind: 'intraday',
  }, takenAt);
  expect(fresh.freshness).toBe('as of 18:00 UTC');
  expect(fresh.freshness).not.toContain('delayed');
  expect(fresh.delayed).toBeUndefined();

  const onTheLine = presentPanelRow({
    label: 'BTC',
    value: '85000',
    change: null,
    note: null,
    asOf: '2026-10-02T16:12:00Z',
    quoteKind: 'intraday',
  }, takenAt);
  expect(onTheLine.freshness).toBe('as of 16:12 UTC');

  const close = presentPanelRow({
    label: 'Brent',
    value: '99.67',
    change: null,
    note: null,
    asOf: '2026-10-01',
    quoteKind: 'close',
  }, takenAt);
  expect(close.freshness).toBe('close 10/1');
  expect(close.freshness).not.toContain('delayed');

  const stale = presentPanelRow({
    label: 'BTC',
    value: '86637',
    change: null,
    note: null,
    asOf: '2026-10-02T18:00:00Z',
    quoteKind: 'intraday',
    stale: true,
  }, takenAt);
  expect(stale.freshness).toBe('delayed, as of 18:00 UTC');

  expect(presentPanelRow({
    label: 'DXY',
    value: '99.1',
    change: null,
    note: null,
  }, takenAt)).toEqual({ label: 'DXY', value: '99.1', change: null, note: null });
});

it('hides odds notes that still say taxonomy or schema', () => {
  expect(publicOddsNote('Data-anchored taxonomy')).toBeNull();
  expect(publicOddsNote('verified schema-v2')).toBeNull();
  expect(publicOddsNote('tail risk gauge')).toBe('tail risk gauge');
  expect(publicOddsNote(null)).toBeNull();
});

it('drops empty comma notes from odds rows', () => {
  expect(
    presentPanelRow({
      label: 'Will 4 Fed rate cuts happen in 2026?',
      value: 'YES 0% , ,',
      change: ', ,',
      note: ', ',
    }),
  ).toEqual({
    label: 'Will 4 Fed rate cuts happen in 2026?',
    value: 'YES 0%',
    change: null,
    note: null,
  });
});
