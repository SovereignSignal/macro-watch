import type { PanelRowItem } from '@/lib/panel-contract';
import type { BriefRow } from '@/lib/queries/briefs';
import type { ThemeCard } from '@/lib/queries/map';
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
  return (
    <main className="container">
      {props.brief ? (
        <BriefArticle brief={props.brief} />
      ) : (
        <EmptyState>
          No brief yet. Daily briefs publish weekdays at 14:00 UTC. Weekend reviews publish
          Saturday at 12:00 UTC.
        </EmptyState>
      )}
      <section aria-label="Market dashboard">
        <PanelTable
          title="Dashboard"
          rows={props.panel?.rows ?? []}
          takenAt={props.panel?.takenAt ?? null}
        />
      </section>
      {props.oddsPanel ? (
        <section aria-label="Prediction market lens">
          <PanelTable
            title="Prediction Market Lens"
            rows={props.oddsPanel.rows}
            takenAt={props.oddsPanel.takenAt}
            summary={props.oddsPanel.summary}
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
