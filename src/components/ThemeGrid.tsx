import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { ThemeCard } from '@/lib/queries/map';
import { DORMANT_AFTER_DAYS, displayStatus } from '@/lib/theme-lifecycle';
import { ConvictionScale } from './ConvictionScale';
import { EmptyState } from './EmptyState';
import { Sparkline } from './Sparkline';
import { TriggerList } from './TriggerList';

type Sparks = Record<string, number[]>;

function Card({
  card,
  spark,
  index,
  asOf,
}: {
  card: ThemeCard;
  spark?: number[];
  index: number;
  asOf: string;
}) {
  // The badge reads the display status (a stale candidate is `dormant`); the
  // gauge keeps the stored one, so a dormant card still shows hollow diamonds.
  const status = displayStatus(card, asOf);
  return (
    <li
      className={status === 'retired' ? 'theme-card is-retired' : 'theme-card'}
      style={{ '--i': index } as CSSProperties}
    >
      <div className="theme-card-head">
        <h3>
          <Link href={`/map/${card.slug}`}>{card.name}</Link>
        </h3>
        <ConvictionScale conviction={card.conviction} hollow={card.status === 'candidate'} />
      </div>
      <p className="theme-description">{card.description}</p>
      <div className="theme-card-gauge">
        <span className={card.conviction ? `conv conv-${card.conviction}` : 'conv'}>
          {card.conviction ?? 'unrated'}
        </span>
        <span className={`badge badge-${status}`}>{status}</span>
        {spark ? <Sparkline levels={spark} /> : null}
      </div>
      {card.read ? <p className="read">{card.read}</p> : null}
      {card.phase ? <p>Evidence phase: {card.phase.replaceAll('_', ' ')}</p> : null}
      <TriggerList triggers={card.triggers} />
    </li>
  );
}

function Cards({
  cards,
  sparks,
  offset,
  asOf,
}: {
  cards: ThemeCard[];
  sparks?: Sparks;
  offset: number;
  asOf: string;
}) {
  return (
    <ul className="theme-grid">
      {cards.map((c, i) => (
        <Card key={c.slug} card={c} spark={sparks?.[c.slug]} index={offset + i} asOf={asOf} />
      ))}
    </ul>
  );
}

function Section({
  title,
  cards,
  sparks,
  offset,
  asOf,
}: {
  title: string;
  cards: ThemeCard[];
  sparks?: Sparks;
  offset: number;
  asOf: string;
}) {
  if (cards.length === 0) return null;
  return (
    <section>
      <h2>
        {title} <span className="section-count">{cards.length}</span>
      </h2>
      <Cards cards={cards} sparks={sparks} offset={offset} asOf={asOf} />
    </section>
  );
}

/** Stale candidates, folded shut: kept and revivable, out of play. */
function DormantSection({
  cards,
  sparks,
  offset,
  asOf,
}: {
  cards: ThemeCard[];
  sparks?: Sparks;
  offset: number;
  asOf: string;
}) {
  if (cards.length === 0) return null;
  const summary = `Dormant (${cards.length}): candidates with no event for ${DORMANT_AFTER_DAYS}+ days`;
  return (
    <details className="theme-dormant">
      <summary>{summary}</summary>
      <Cards cards={cards} sparks={sparks} offset={offset} asOf={asOf} />
    </details>
  );
}

/**
 * The living theme map grid, grouped by lifecycle (spec §5 /map). `asOf`
 * (YYYY-MM-DD) is the map's clock (the snapshot's newest event date, today
 * only as a fallback) that decides which candidates are dormant.
 */
export function ThemeGrid({
  cards,
  sparks,
  asOf,
}: {
  cards: ThemeCard[];
  sparks?: Sparks;
  asOf: string;
}) {
  if (cards.length === 0) {
    return <EmptyState>No themes yet.</EmptyState>;
  }
  const withStatus = (status: string) => cards.filter((c) => displayStatus(c, asOf) === status);
  const active = withStatus('active');
  const candidates = withStatus('candidate');
  const dormant = withStatus('dormant');
  const retired = withStatus('retired');
  return (
    <>
      <Section title="Active" cards={active} sparks={sparks} offset={0} asOf={asOf} />
      <Section
        title="Candidates"
        cards={candidates}
        sparks={sparks}
        offset={active.length}
        asOf={asOf}
      />
      <DormantSection
        cards={dormant}
        sparks={sparks}
        offset={active.length + candidates.length}
        asOf={asOf}
      />
      <Section
        title="Retired"
        cards={retired}
        sparks={sparks}
        offset={active.length + candidates.length + dormant.length}
        asOf={asOf}
      />
    </>
  );
}
