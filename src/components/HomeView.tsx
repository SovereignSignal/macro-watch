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
  cards: ThemeCard[];
  sparks?: Record<string, number[]>;
}) {
  return (
    <main className="container">
      {props.brief ? (
        <BriefArticle brief={props.brief} />
      ) : (
        <EmptyState>
          No brief published yet. Dailies land at 14:00 UTC Monday–Friday; the weekend review lands
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
