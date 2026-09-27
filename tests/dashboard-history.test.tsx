import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { HomeView } from '@/components/HomeView';
import { PanelTable } from '@/components/PanelTable';
import { upsertPanel } from '@/lib/ingest/panels';
import { getDashboardHistory } from '@/lib/queries/panels';
import { createTestDb } from './helpers/db';

const ROW = { label: 'ES', value: '6,400', change: '+0.2%', note: null };

it('renders no trend column when only one dashboard snapshot exists', async () => {
  const db = await createTestDb();
  await upsertPanel(db, {
    kind: 'dashboard',
    taken_at: '2026-07-11T12:00:00Z',
    payload: { rows: [ROW] },
  });
  expect(await getDashboardHistory(db)).toEqual({});
  const markup = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={{ takenAt: '2026-07-11T12:00:00Z', rows: [ROW], history: {} }}
      cards={[]}
    />,
  );
  expect(markup).toContain('6,400');
  expect(markup).not.toContain('Trend');
  expect(markup).not.toContain('spark-line');
});

it('draws a sparkline from dashboard snapshot history and from an inline series', async () => {
  const db = await createTestDb();
  await upsertPanel(db, {
    kind: 'dashboard',
    taken_at: '2026-07-10T12:00:00Z',
    payload: { rows: [{ ...ROW, value: '6,300' }] },
  });
  await upsertPanel(db, {
    kind: 'dashboard',
    taken_at: '2026-07-11T12:00:00Z',
    payload: { rows: [{ ...ROW, value: '6,410.50' }] },
  });
  const history = await getDashboardHistory(db);
  expect(history.ES).toEqual([6300, 6410.5]);
  const fromHistory = renderToStaticMarkup(
    <PanelTable title="Dashboard" rows={[{ ...ROW, spark: history.ES }]} takenAt={null} />,
  );
  expect(fromHistory).toContain('Trend');
  expect(fromHistory).toContain('aria-label="ES trend"');
  expect(fromHistory).toContain('spark-line');

  const inline = renderToStaticMarkup(
    <PanelTable
      title="Dashboard"
      rows={[{ ...ROW, spark: [1, 2, Number.NaN] }]}
      takenAt={null}
    />,
  );
  expect(inline).not.toContain('spark-line');
});
