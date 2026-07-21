import { HomeView } from '@/components/HomeView';
import { getDb } from '@/db/client';
import { panelCoverage, panelRows } from '@/lib/panel-contract';
import { getLatestBrief } from '@/lib/queries/briefs';
import { getConvictionSparks, getThemeMapCards } from '@/lib/queries/map';
import { getLatestPanel } from '@/lib/queries/panels';
import { safeQuery } from '@/lib/safe';
import { pageMetadata } from '@/lib/metadata';

// ISR fallback: pages keep serving if Postgres blips; ingest revalidates
// on-demand the moment a publish lands (spec §6).
export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'macro.watch',
  description: 'The latest macro brief, market dashboard, and active themes.',
  path: '/',
});

export default async function HomePage() {
  const db = getDb();
  const brief = await safeQuery(() => getLatestBrief(db), null);
  const panel = await safeQuery(() => getLatestPanel(db, 'dashboard'), null);
  const oddsPanel = await safeQuery(() => getLatestPanel(db, 'odds_lens'), null);
  const map = await safeQuery(() => getThemeMapCards(db), { takenAt: null, cards: [] });
  const sparks = await safeQuery(() => getConvictionSparks(db), {});
  return (
    <HomeView
      brief={brief}
      panel={panel ? { takenAt: panel.takenAt.toISOString(), rows: panelRows(panel.payload) } : null}
      oddsPanel={oddsPanel ? {
        takenAt: oddsPanel.takenAt.toISOString(),
        rows: panelRows(oddsPanel.payload),
        summary: panelCoverage(oddsPanel.payload),
      } : null}
      cards={map.cards}
      sparks={sparks}
    />
  );
}
