import { expect, it } from 'vitest';
import { presentDashboardRows, presentPanelRow } from '@/lib/panel-present';

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

it('unitizes live dashboard values that carry an as-of suffix', () => {
  expect(
    presentPanelRow({
      label: 'Fed Balance Sheet',
      value: '6730912.0 (as of 2026-08-29)',
      change: '-0.22% (7d)',
      note: null,
    }).value,
  ).toBe('$6.73T (as of 2026-08-29)');
  expect(
    presentPanelRow({
      label: 'Reverse Repo (RRP)',
      value: '0.17 (as of 2026-08-29)',
      change: null,
      note: null,
    }).value,
  ).toBe('$0.17B (as of 2026-08-29)');
  expect(
    presentPanelRow({
      label: 'HY Spread (OAS)',
      value: '2.63 (as of 2026-08-29)',
      change: null,
      note: null,
    }).value,
  ).toBe('263 bp (as of 2026-08-29)');
  expect(
    presentPanelRow({
      label: 'IG Spread (OAS)',
      value: '0.79 (as of 2026-08-29)',
      change: null,
      note: null,
    }).value,
  ).toBe('79 bp (as of 2026-08-29)');
  expect(
    presentPanelRow({
      label: 'S&P 500 (SPY)',
      value: '769.35 (as of 2026-08-29)',
      change: '+0.60% (7d)',
      note: null,
    }).value,
  ).toBe('769.35 (as of 2026-08-29)');
});

it('drops repeated as-of and 7d labels on the homepage tape', () => {
  const tape = presentDashboardRows([
    { label: 'Fed Balance Sheet', value: '6730912.0 (as of 2026-08-29)', change: '-0.22% (7d)', note: null },
    { label: 'HY Spread (OAS)', value: '2.63 (as of 2026-08-29)', change: null, note: null },
  ]);
  expect(tape.changeColumn).toBe('Change (7d)');
  expect(tape.rows[0]).toMatchObject({ value: '$6.73T', change: '-0.22%' });
  expect(tape.rows[1].value).toBe('263 bp');
});

it('does not treat month names inside as-of as already-unitized', () => {
  expect(
    presentPanelRow({
      label: 'Fed Balance Sheet',
      value: '6,730,912.00 (as of August 29, 2026)',
      change: '-0.22%',
      note: null,
    }).value,
  ).toBe('$6.73T (as of August 29, 2026)');
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
