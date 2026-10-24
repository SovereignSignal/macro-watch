import type { PanelRowItem } from '@/lib/panel-contract';
import type { BriefRow } from '@/lib/queries/briefs';
import type { OddsStatus } from '@/lib/odds-state';
import type { ThemeCard } from '@/lib/queries/map';
import { presentDashboardRows, presentPanelRows, publicOddsNote } from '@/lib/panel-present';
import { EMPTY_WATCH, type PublishedWatch } from '@/lib/public-watch';
import { BriefArticle } from './BriefArticle';
import { EmptyState } from './EmptyState';
import { KalshiMovers } from './KalshiMovers';
import { PanelTable } from './PanelTable';
import { ThemeStrip } from './ThemeStrip';
import { TrackRecordSummary } from './TrackRecord';

export function HomeView(props: {
  brief: BriefRow | null;
  panel: { takenAt: string; rows: PanelRowItem[]; history?: Record<string, number[]> } | null;
  oddsPanel?: {
    takenAt: string | null;
    rows: PanelRowItem[];
    summary?: string | null;
    /** Omitted by older callers: treated as fresh. Stale and unavailable never render odds. */
    status?: OddsStatus;
    message?: string | null;
  } | null;
  cards: ThemeCard[];
  sparks?: Record<string, number[]>;
  asOf?: string;
  watch?: PublishedWatch | null;
  /** Members see the track record widget and smart-money data. Defaults to false (fail closed). */
  member?: boolean;
}) {
  const member = props.member === true;
  const dashboard = presentDashboardRows(props.panel?.rows ?? [], props.panel?.history, props.panel?.takenAt);
  const oddsStatus = props.oddsPanel?.status ?? 'fresh';
  const oddsLive = oddsStatus === 'fresh';
  const oddsRows = presentPanelRows(oddsLive ? props.oddsPanel?.rows ?? [] : [], props.oddsPanel?.takenAt ?? undefined).map((row) => ({
    ...row,
    note: member ? publicOddsNote(row.note) : null,
  }));
  const watch = props.watch ?? EMPTY_WATCH;
  return (
    <main className="container">
      {props.brief ? (
        <BriefArticle brief={props.brief} stripDuplicatePanels member={member} />
      ) : (
        <EmptyState>
          No brief yet. Daily briefs publish weekdays at 14:00 UTC, the Weekend Review Saturday
          at 17:00 UTC, and the Week Ahead Sunday at 23:00 UTC.
        </EmptyState>
      )}
      <section aria-label="Market dashboard">
        <PanelTable
          title="Dashboard"
          rows={dashboard.rows}
          takenAt={props.panel?.takenAt ?? null}
          columns={['Market', 'Value', dashboard.changeColumn]}
          horizonColumns={dashboard.horizonColumns}
        />
      </section>
      {props.oddsPanel && !oddsLive ? (
        <section aria-label="Prediction market lens" data-odds-status={oddsStatus}>
          <h2>Prediction Market Lens</h2>
          <p className="odds-status">{props.oddsPanel.message ?? 'Prediction market odds are unavailable right now.'}</p>
        </section>
      ) : null}
      {props.oddsPanel && oddsLive ? (
        <section aria-label="Prediction market lens" data-odds-status="fresh">
          <PanelTable
            title="Prediction Market Lens"
            rows={oddsRows}
            takenAt={props.oddsPanel.takenAt}
            summary={member ? props.oddsPanel.summary : null}
            columns={member ? ['Market', 'Odds', '24-hour flow'] : ['Market', 'Odds']}
          />
        </section>
      ) : null}
      {member ? <TrackRecordSummary scoreboard={watch.scoreboard} /> : null}
      <KalshiMovers movers={watch.kalshiMovers} />
      <section aria-label="Theme map">
        <h2>Theme map</h2>
        <ThemeStrip cards={props.cards} sparks={props.sparks} asOf={props.asOf} />
      </section>
      <p className="home-footer-links">
        <a href="/briefs">Brief archive</a> · <a href="/feed.xml">RSS</a>
      </p>
    </main>
  );
}
