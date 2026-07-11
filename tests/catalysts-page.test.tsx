import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getForwardEvents } from '@/lib/queries/catalysts';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: CatalystsPage } = await import('@/app/catalysts/page');

it('splits events on resolution: null = upcoming (soonest first), resolved newest first', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const { upcoming, resolved } = await getForwardEvents(db);
  expect(upcoming.map((e) => e.eventId)).toEqual(['fe-2026-07-15-us-cpi', 'fe-2026-07-30-fomc']);
  expect(resolved.map((e) => e.eventId)).toEqual(['fe-2026-07-03-us-payrolls']);
});

it('renders upcoming with surprise framing and resolved as expectation vs outcome', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await CatalystsPage());
  expect(markup).toContain('US CPI (June)');
  expect(markup).toContain('What would surprise');
  expect(markup).toContain('A 0.4%+ core print');
  expect(markup).toContain('US payrolls (June)');
  expect(markup).toContain('Outcome');
  expect(markup).toContain('+147k with upward revisions');
  expect(markup).toContain('resolved July 5, 2026');
});

it('renders empty states with no events', async () => {
  await createTestDb();
  const markup = renderToStaticMarkup(await CatalystsPage());
  expect(markup).toContain('No upcoming catalysts on the board');
  expect(markup).toContain('Nothing resolved yet');
});
