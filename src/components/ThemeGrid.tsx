import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { ThemeCard } from '@/lib/queries/map';
import { CellPhaseChip } from './CellPhaseChip';
import { ConvictionScale } from './ConvictionScale';
import { EmptyState } from './EmptyState';
import { Sparkline } from './Sparkline';
import { TriggerList } from './TriggerList';

type Sparks = Record<string, number[]>;

function Card({ card, spark, index }: { card: ThemeCard; spark?: number[]; index: number }) {
  return (
    <li
      className={card.status === 'retired' ? 'theme-card is-retired' : 'theme-card'}
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
        <span className={`badge badge-${card.status}`}>{card.status}</span>
        <CellPhaseChip phase={card.cellPhase} ageDays={card.phaseAgeDays} />
        {spark ? <Sparkline levels={spark} /> : null}
      </div>
      {card.read ? <p className="read">{card.read}</p> : null}
      <TriggerList triggers={card.triggers} />
    </li>
  );
}

function Section({
  title,
  cards,
  sparks,
  offset,
}: {
  title: string;
  cards: ThemeCard[];
  sparks?: Sparks;
  offset: number;
}) {
  if (cards.length === 0) return null;
  return (
    <section>
      <h2>{title}</h2>
      <ul className="theme-grid">
        {cards.map((c, i) => (
          <Card key={c.slug} card={c} spark={sparks?.[c.slug]} index={offset + i} />
        ))}
      </ul>
    </section>
  );
}

/** The living theme map grid, grouped by lifecycle (spec §5 /map). */
export function ThemeGrid({ cards, sparks }: { cards: ThemeCard[]; sparks?: Sparks }) {
  if (cards.length === 0) {
    return <EmptyState>No themes yet.</EmptyState>;
  }
  const active = cards.filter((c) => c.status === 'active');
  const candidates = cards.filter((c) => c.status === 'candidate');
  const retired = cards.filter((c) => c.status === 'retired');
  return (
    <>
      <Section title="Active" cards={active} sparks={sparks} offset={0} />
      <Section title="Candidates" cards={candidates} sparks={sparks} offset={active.length} />
      <Section
        title="Retired"
        cards={retired}
        sparks={sparks}
        offset={active.length + candidates.length}
      />
    </>
  );
}
