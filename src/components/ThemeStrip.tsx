import Link from 'next/link';
import type { ThemeCard } from '@/lib/queries/map';
import { isDormant } from '@/lib/theme-lifecycle';
import { ConvictionScale } from './ConvictionScale';
import { EmptyState } from './EmptyState';
import { Sparkline } from './Sparkline';

/** Compact theme-map strip for the home page (spec §5 /), with smaller instruments. */
export function ThemeStrip({
  cards,
  sparks,
  asOf,
}: {
  cards: ThemeCard[];
  sparks?: Record<string, number[]>;
  /** YYYY-MM-DD; when given, dormant candidates (no event for 45+ days) stay off the strip. */
  asOf?: string;
}) {
  const live = cards.filter((c) => c.status !== 'retired' && !(asOf && isDormant(c, asOf)));
  if (live.length === 0) {
    return <EmptyState>No themes yet.</EmptyState>;
  }
  return (
    <>
      <ul className="theme-strip">
        {live.map((c) => (
          <li key={c.slug}>
            <Link href={`/map/${c.slug}`} className="strip-name">
              {c.name}
            </Link>
            <p className="strip-description">{c.description}</p>
            <span className="strip-gauge">
              <ConvictionScale conviction={c.conviction} hollow={c.status === 'candidate'} />
              {c.conviction ? <span className={`conv conv-${c.conviction}`}>{c.conviction}</span> : null}
              <span className={`badge badge-${c.status}`}>{c.status}</span>
              {sparks?.[c.slug] ? <Sparkline levels={sparks[c.slug]} width={56} height={16} /> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="map-link">
        <Link href="/map">Full theme map →</Link>
      </p>
    </>
  );
}
