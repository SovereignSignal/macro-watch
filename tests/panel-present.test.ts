import { expect, it } from 'vitest';
import { presentPanelRow } from '@/lib/panel-present';

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
