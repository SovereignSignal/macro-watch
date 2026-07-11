import Link from 'next/link';
import type { ThemeCard } from '@/lib/queries/map';
import { EmptyState } from './EmptyState';

function Section({ title, cards }: { title: string; cards: ThemeCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section>
      <h2>{title}</h2>
      <ul className="theme-grid">
        {cards.map((c) => (
          <li key={c.slug} className="theme-card">
            <h3>
              <Link href={`/map/${c.slug}`}>{c.name}</Link>
            </h3>
            <p>
              <span className={c.conviction ? `conv conv-${c.conviction}` : 'conv'}>
                conviction: {c.conviction ?? '—'}
              </span>{' '}
              <span className={`badge badge-${c.status}`}>{c.status}</span>
            </p>
            {c.read ? <p className="read">{c.read}</p> : null}
            {c.triggers.length > 0 ? (
              <ul className="trigger-list">
                {c.triggers.map((t) => (
                  <li key={t.name}>
                    {t.name}: {t.state}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The living theme map grid, grouped by lifecycle (spec §5 /map). */
export function ThemeGrid({ cards }: { cards: ThemeCard[] }) {
  if (cards.length === 0) {
    return <EmptyState>No themes on the map yet. Themes appear as the system surfaces and grades them.</EmptyState>;
  }
  return (
    <>
      <Section title="Active" cards={cards.filter((c) => c.status === 'active')} />
      <Section title="Candidates" cards={cards.filter((c) => c.status === 'candidate')} />
      <Section title="Retired" cards={cards.filter((c) => c.status === 'retired')} />
    </>
  );
}
