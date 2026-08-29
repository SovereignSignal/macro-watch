import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FieldMap } from '@/components/FieldMap';
import { upsertThemeState } from '@/lib/ingest/themes';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: MapPage } = await import('@/app/map/page');
const { default: ThemePage } = await import('@/app/map/[theme]/page');

async function seedWithIgnition() {
  const db = await createTestDb();
  await seedAll(db);
  await upsertThemeState(db, {
    taken_at: '2026-07-12T12:10:00Z',
    payload: {
      themes: [
        {
          slug: 'rate-path-repricing',
          name: 'Rate-path repricing',
          conviction: 'high',
          current_read: 'The front end is still underpricing how slow the cutting cycle gets.',
          cell_phase: 'ignition',
          phase_age_days: 6,
        },
        {
          slug: 'dollar-downtrend',
          name: 'Dollar downtrend',
          conviction: 'medium',
          cell_phase: 'compression',
          phase_age_days: 0,
        },
      ],
    },
  });
  return db;
}

it('threads cell phase onto map cards and the dossier', async () => {
  await seedWithIgnition();
  const map = renderToStaticMarkup(await MapPage());
  expect(map).toContain('Ignition · 6d');
  expect(map).toContain('Compression · today');
  expect(map).toContain('Cell phase (ignition, crack, and the rest) is on the cards, not this plot.');
  expect(map).toContain('pressured');
  expect(map).not.toContain('>the front<');

  const dossier = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'rate-path-repricing' }) }),
  );
  expect(dossier).toContain('Ignition · 6d');
  expect(dossier).toContain('badge-phase-ignition');
});

it('FieldMap tooltips name cell phase and the plot says pressured', () => {
  const markup = renderToStaticMarkup(
    <FieldMap
      themes={[
        {
          slug: 'rate-path',
          name: 'Rate path',
          status: 'active',
          conviction: 'high',
          lastEventAt: '2026-07-08',
          cellPhase: 'ignition',
          events: [{ direction: 'raise', date: '2026-07-08' }],
        },
        {
          slug: 'other',
          name: 'Other',
          status: 'active',
          conviction: 'medium',
          lastEventAt: null,
          events: [],
        },
      ]}
      asOf="2026-07-11"
    />,
  );
  expect(markup).toContain('cell phase ignition');
  expect(markup).toContain('pressured');
  expect(markup).not.toContain('the front');
});
