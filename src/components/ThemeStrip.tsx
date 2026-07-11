import Link from 'next/link';
import type { ThemeCard } from '@/lib/queries/map';
import { EmptyState } from './EmptyState';

/** Compact theme-map strip for the home page (spec §5 /). */
export function ThemeStrip({ cards }: { cards: ThemeCard[] }) {
  const live = cards.filter((c) => c.status !== 'retired');
  if (live.length === 0) {
    return <EmptyState>No themes on the map yet. Themes appear as the system surfaces and grades them.</EmptyState>;
  }
  return (
    <>
      <ul className="theme-strip">
        {live.map((c) => (
          <li key={c.slug}>
            <Link href={`/map/${c.slug}`}>{c.name}</Link>{' '}
            {c.conviction ? <span className={`conv conv-${c.conviction}`}>{c.conviction}</span> : null}{' '}
            <span className={`badge badge-${c.status}`}>{c.status}</span>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/map">Full theme map →</Link>
      </p>
    </>
  );
}
