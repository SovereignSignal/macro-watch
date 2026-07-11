import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConvictionChart } from '@/components/ConvictionChart';
import { EmptyState } from '@/components/EmptyState';
import { ThemeTimeline } from '@/components/ThemeTimeline';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { getThemeDetail } from '@/lib/queries/map';

export const revalidate = 900;

// Theme slugs are kebab-case (spec §4: themes.slug). Reject anything else
// before it ever reaches the database, same pattern as /briefs/[date]'s
// DATE_RE guard.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function generateMetadata({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  if (!SLUG_RE.test(theme)) return { title: 'Theme' };
  const detail = await getThemeDetail(getDb(), theme);
  return { title: detail ? detail.name : 'Theme' };
}

export default async function ThemePage({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  if (!SLUG_RE.test(theme)) notFound();
  // Deliberately NOT safeQuery: mirrors /briefs/[date] — a DB blip during
  // background revalidation should keep serving the stale page, not 404 it.
  const detail = await getThemeDetail(getDb(), theme);
  if (!detail) notFound();
  const card = detail.card;
  return (
    <main className="container">
      <p className="brief-meta">
        <Link href="/map">← Theme map</Link>
      </p>
      <h1>{detail.name}</h1>
      <p>
        <span className={`badge badge-${detail.status}`}>{detail.status}</span>{' '}
        {card?.conviction ? (
          <span className={`conv conv-${card.conviction}`}>conviction: {card.conviction}</span>
        ) : null}{' '}
        {detail.firstSeen ? (
          <span className="brief-meta">on the map since {formatDate(detail.firstSeen)}</span>
        ) : null}
      </p>
      {card?.read ? <p className="read">{card.read}</p> : null}

      {card && card.raiseConditions.length + card.lowerConditions.length > 0 ? (
        <section>
          <h2>What would move it</h2>
          {card.raiseConditions.length > 0 ? (
            <>
              <h3>Raise</h3>
              <ul>
                {card.raiseConditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
          {card.lowerConditions.length > 0 ? (
            <>
              <h3>Lower</h3>
              <ul>
                {card.lowerConditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {card && card.triggers.length > 0 ? (
        <section>
          <h2>Live triggers</h2>
          <ul className="trigger-list">
            {card.triggers.map((t) => (
              <li key={t.name}>
                {t.name}: {t.state}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>Conviction over time</h2>
        <ConvictionChart points={detail.conviction} />
      </section>

      <section>
        <h2>Event timeline</h2>
        <ThemeTimeline events={detail.events} briefDates={detail.briefDates} />
      </section>

      <section>
        <h2>Related claims</h2>
        {detail.relatedClaims.length === 0 ? (
          <EmptyState>No claims reference this theme yet.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Opened</th>
                <th>Predicate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.relatedClaims.map((c) => (
                <tr key={c.claimId}>
                  <td>{c.openedAt}</td>
                  <td>{c.predicate}</td>
                  <td className={`status-${c.status}`}>
                    {c.status.replaceAll('_', ' ').replaceAll('-', ' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
