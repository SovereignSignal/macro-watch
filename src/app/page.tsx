import { HomeView } from '@/components/HomeView';
import { getDb } from '@/db/client';
import { panelRows } from '@/lib/panel-contract';
import { getLatestBrief } from '@/lib/queries/briefs';
import { getConvictionSparks, getThemeMapCards } from '@/lib/queries/map';
import { getDashboardHistory, getLatestPanel, getLatestVerifiedPanel } from '@/lib/queries/panels';
import { safeQuery } from '@/lib/safe';
import { pageMetadata } from '@/lib/metadata';

// ISR fallback: pages keep serving if Postgres blips; ingest revalidates
// on-demand the moment a publish lands (spec §6).
export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Sovs Macro',
  description: 'The latest macro brief, market dashboard, and active themes.',
  path: '/',
});

export default async function HomePage() {
  const db = getDb();
  const brief = await safeQuery(() => getLatestBrief(db), null);
  const panel = await safeQuery(() => getLatestPanel(db, 'dashboard'), null);
  const dashboardHistory = await safeQuery(() => getDashboardHistory(db), {});
  const oddsPanel = await safeQuery(() => getLatestVerifiedPanel(db, 'odds_lens'), null);
  const map = await safeQuery(() => getThemeMapCards(db), { takenAt: null, cards: [], asOf: null });
  const sparks = await safeQuery(() => getConvictionSparks(db), {});
  // The home strip keeps dormant candidates off the field on the map's own clock, like /map.
  const asOf = map.asOf ?? new Date().toISOString().slice(0, 10);
  return (
    <HomeView
      brief={brief}
      panel={panel ? {
        takenAt: panel.takenAt.toISOString(),
        rows: panelRows(panel.payload),
        history: dashboardHistory,
      } : null}
      oddsPanel={oddsPanel ? {
        takenAt: oddsPanel.takenAt.toISOString(),
        rows: oddsPanel.view.rows,
        summary: oddsPanel.view.coverage,
      } : null}
      cards={map.cards}
      sparks={sparks}
      asOf={asOf}
    />
  );
}
