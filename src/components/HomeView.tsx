import Link from 'next/link';
import type { PanelRowItem } from '@/lib/panel-contract';
import { formatDate } from '@/lib/format';
import type { BriefRow } from '@/lib/queries/briefs';
import type { ThemeCard } from '@/lib/queries/map';
import { sanitizePublicBriefText } from '@/lib/security/public-brief-html';
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
  const activeCards = props.cards.filter((card) => card.status === 'active').slice(0, 6);
  return (
    <main className="container">
      {props.brief ? (
        <header className="home-lead">
          <p className="home-kicker">
            <span className="date">{formatDate(props.brief.date)}</span>
            {props.brief.kind === 'weekend' ? (
              <span className="badge badge-weekend">Weekend review</span>
            ) : (
              <span className="badge">Daily brief</span>
            )}
          </p>
          <h1>{sanitizePublicBriefText(props.brief.subject)}</h1>
          <p className="home-deck">{sanitizePublicBriefText(props.brief.ping)}</p>
          <nav className="home-jumps" aria-label="On this page">
            <a href="#live-tape">Live tape</a>
            <a href="#active-themes">Active themes</a>
            <a href="#full-brief">Full brief</a>
          </nav>
        </header>
      ) : (
        <EmptyState>
          No brief yet. Daily briefs publish weekdays at 14:00 UTC. Weekend reviews publish
          Saturday at 12:00 UTC.
        </EmptyState>
      )}
      <section id="live-tape" className="home-module" aria-label="Live market tape">
        <PanelTable
          title="Live tape"
          rows={props.panel?.rows ?? []}
          takenAt={props.panel?.takenAt ?? null}
        />
      </section>
      <section id="active-themes" className="home-module" aria-labelledby="active-themes-title">
        <div className="home-module-head">
          <h2 id="active-themes-title">Active themes</h2>
          <Link href="/map">View all {props.cards.length} →</Link>
        </div>
        <ThemeStrip cards={activeCards} sparks={props.sparks} showMapLink={false} />
      </section>
      {props.brief ? (
        <section id="full-brief" className="home-full-brief" aria-labelledby="full-brief-title">
          <div className="home-module-head">
            <h2 id="full-brief-title">Full brief</h2>
            <Link href={`/briefs/${props.brief.date}`}>Permalink →</Link>
          </div>
          <BriefArticle brief={props.brief} showHeader={false} />
        </section>
      ) : null}
      <p className="home-footer-links">
        <Link href="/briefs">Brief archive</Link> · <a href="/feed.xml">RSS</a>
      </p>
    </main>
  );
}
