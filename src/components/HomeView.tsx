import type { PanelRowItem } from '@/lib/panel-contract';
import type { BriefRow } from '@/lib/queries/briefs';
import type { ThemeCard } from '@/lib/queries/map';
import { presentDashboardRows, presentPanelRows } from '@/lib/panel-present';
import { BriefArticle } from './BriefArticle';
import { EmptyState } from './EmptyState';
import { PanelTable } from './PanelTable';
import { ThemeStrip } from './ThemeStrip';

export function HomeView(props: {
  brief: BriefRow | null;
  panel: { takenAt: string; rows: PanelRowItem[] } | null;
  oddsPanel?: { takenAt: string; rows: PanelRowItem[]; summary?: string | null } | null;
  cards: ThemeCard[];
  sparks?: Record<string, number[]>;
}) {
  const dashboard = presentDashboardRows(props.panel?.rows ?? []);
  const oddsRows = presentPanelRows(props.oddsPanel?.rows ?? []);
  return (
    <main className="container">
      {props.brief ? (
        <BriefArticle brief={props.brief} stripDuplicatePanels />
      ) : (
        <EmptyState>
          No brief yet. Daily briefs publish weekdays at 14:00 UTC. Weekend reviews publish
          Saturday at 12:00 UTC.
        </EmptyState>
      )}
      <section aria-label="Market dashboard">
        <PanelTable
          title="Dashboard"
          rows={dashboard.rows}
          takenAt={props.panel?.takenAt ?? null}
          columns={['Market', 'Value', dashboard.changeColumn]}
        />
      </section>
      {props.oddsPanel ? (
        <section aria-label="Prediction market lens">
          <PanelTable
            title="Prediction Market Lens"
            rows={oddsRows}
            takenAt={props.oddsPanel.takenAt}
            summary={props.oddsPanel.summary}
            columns={['Market', 'Odds', '24-hour flow']}
          />
        </section>
      ) : null}
      <section aria-label="Theme map">
        <h2>Theme map</h2>
        <ThemeStrip cards={props.cards} sparks={props.sparks} />
      </section>
      <p className="home-footer-links">
        <a href="/briefs">Brief archive</a> · <a href="/feed.xml">RSS</a>
      </p>
    </main>
  );
}
