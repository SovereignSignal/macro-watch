import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ConvictionChart } from '@/components/ConvictionChart';
import { ConvictionScale } from '@/components/ConvictionScale';
import { EmptyState } from '@/components/EmptyState';
import { Sparkline } from '@/components/Sparkline';
import { ThemeTimeline } from '@/components/ThemeTimeline';
import { TriggerList } from '@/components/TriggerList';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { isMember } from '@/lib/member-session';
import { pageMetadata } from '@/lib/metadata';
import { getMapClock, getThemeDetail, hasCanonicalTheme } from '@/lib/queries/map';
import { canonicalThemeSlug } from '@/lib/theme-display';
import { safeQuery } from '@/lib/safe';
import { displayStatus } from '@/lib/theme-lifecycle';
import { statusLabel } from '@/lib/claim-display';

export const dynamic = 'force-dynamic';

// Theme slugs are kebab-case (spec §4: themes.slug). Reject anything else
// before it ever reaches the database, same pattern as /briefs/[date]'s
// DATE_RE guard.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function generateMetadata({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  if (!SLUG_RE.test(theme)) {
    return pageMetadata({
      title: 'Theme',
      description: 'A Sovs Macro theme dossier.',
      path: '/map',
    });
  }
  const detail = await getThemeDetail(getDb(), theme);
  return pageMetadata({
    title: detail ? detail.name : 'Theme',
    description: detail?.card?.description ?? detail?.card?.read ?? 'A Sovs Macro theme dossier.',
    path: `/map/${theme}`,
  });
}

export default async function ThemePage({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  if (!SLUG_RE.test(theme)) notFound();
  const canonical = canonicalThemeSlug(theme);
  if (canonical !== theme && (await hasCanonicalTheme(getDb(), theme))) {
    permanentRedirect(`/map/${canonical}`);
  }
  // Deliberately NOT safeQuery: mirrors /briefs/[date]. A DB blip during
  // background revalidation should keep serving the stale page, not 404 it.
  const detail = await getThemeDetail(getDb(), theme);
  if (!detail) notFound();
  const member = await isMember();
  const card = detail.card;
  // Same as-of read as /map: the map's own clock, so a stale candidate shows
  // as dormant here exactly when the map and the pipeline say so.
  const asOf =
    (await safeQuery(() => getMapClock(getDb()), null)) ?? new Date().toISOString().slice(0, 10);
  const status = displayStatus(detail, asOf);
  const sparkLevels = detail.conviction.map((p) => p.level);
  return (
    <main className="container">
      <p className="crumb">
        <Link href="/map">← Theme map</Link>
      </p>
      <header className={detail.status === 'retired' ? 'dossier-head is-retired' : 'dossier-head'}>
        <div className="theme-card-head">
          <h1>{detail.name}</h1>
          <ConvictionScale
            conviction={card?.conviction ?? null}
            hollow={detail.status === 'candidate'}
          />
        </div>
        {card?.description ? <p className="theme-description">{card.description}</p> : null}
        <div className="theme-card-gauge">
          <span className={card?.conviction ? `conv conv-${card.conviction}` : 'conv'}>
            {card?.conviction ?? 'unrated'}
          </span>
          <span className={`badge badge-${status}`}>{status}</span>
          {detail.firstSeen ? (
            <span className="since">on the map since {formatDate(detail.firstSeen)}</span>
          ) : null}
          <Sparkline levels={sparkLevels} />
        </div>
        {card?.read ? <p className="read">{card.read}</p> : null}
      </header>

      {card && card.raiseConditions.length + card.lowerConditions.length > 0 ? (
        <section>
          <h2>What would move it</h2>
          {card.raiseConditions.length > 0 ? (
            <>
              <h3 className="cond cond-raise">▲ Raise</h3>
              <ul>
                {card.raiseConditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
          {card.lowerConditions.length > 0 ? (
            <>
              <h3 className="cond cond-lower">▼ Lower</h3>
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
          <TriggerList triggers={card.triggers} />
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
        {!member ? (
          <EmptyState>
            Related claims are available to members.{' '}
            <Link href="/accountability">Sign in</Link> to see them.
          </EmptyState>
        ) : detail.relatedClaims.length === 0 ? (
          <EmptyState>No claims reference this theme yet.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>Opened</th>
                  <th>Claim</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.relatedClaims.map((c) => (
                  <tr key={c.claimId}>
                    <td className="cell-mono">{formatDate(c.openedAt)}</td>
                    <td>{c.predicate}</td>
                    <td className={`cell-mono status-${c.status}`}>
                      {statusLabel(c.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
