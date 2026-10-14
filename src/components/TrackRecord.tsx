import {
  formatBrier,
  formatHitRate,
  formatWatchDate,
  statusLabel,
  type Scoreboard,
} from '@/lib/public-watch';
import { EmptyState } from './EmptyState';

function headline(scoreboard: Scoreboard): string {
  const rate = scoreboard.totals.hitRate;
  const formatted = rate == null ? null : formatHitRate(rate);
  if (formatted) return `${formatted} hit rate`;
  return 'No hit rate yet';
}

function Totals({ scoreboard }: { scoreboard: Scoreboard }) {
  const { totals } = scoreboard;
  const brier = totals.brier == null ? null : formatBrier(totals.brier);
  const stats: { label: string; value: string }[] = [];
  if (totals.scored != null) stats.push({ label: 'Scored', value: String(totals.scored) });
  if (totals.hit != null) stats.push({ label: 'Hit', value: String(totals.hit) });
  if (totals.miss != null) stats.push({ label: 'Miss', value: String(totals.miss) });
  if (totals.voided != null) stats.push({ label: 'Void', value: String(totals.voided) });
  if (totals.open != null) stats.push({ label: 'Open', value: String(totals.open) });
  if (brier) stats.push({ label: 'Brier', value: brier });
  if (stats.length === 0) return null;
  return (
    <dl className="accountability-stats">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CallTitle({ title, url }: { title: string; url: string | null }) {
  if (!url) return title;
  return <a href={url} rel="noopener noreferrer">{title}</a>;
}

export function TrackRecordSummary({ scoreboard }: { scoreboard: Scoreboard | null }) {
  const brier = scoreboard?.totals.brier == null ? null : formatBrier(scoreboard.totals.brier);
  const counts = scoreboard
    ? [
      scoreboard.totals.hit == null ? null : `${scoreboard.totals.hit} hit`,
      scoreboard.totals.miss == null ? null : `${scoreboard.totals.miss} miss`,
      scoreboard.totals.voided == null ? null : `${scoreboard.totals.voided} void`,
      scoreboard.totals.open == null ? null : `${scoreboard.totals.open} open`,
    ].filter((part): part is string => part != null)
    : [];
  return (
    <section className="panel" aria-label="Track record">
      <div className="panel-head">
        <h2>Track record</h2>
        <a href="/track-record">Full record</a>
      </div>
      {scoreboard ? (
        <p className="track-summary">
          <span className="track-rate">{headline(scoreboard)}</span>
          {counts.length > 0 ? <span className="track-counts">{counts.join(' · ')}</span> : null}
          {brier ? <span className="track-brier">Brier {brier}</span> : null}
        </p>
      ) : (
        <EmptyState>No public calls yet.</EmptyState>
      )}
    </section>
  );
}

function openCallTable(calls: Scoreboard['open'], caption: string) {
  return (
    <div className="panel-table-scroll">
      <table className="panel-table panel-table--stack">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Call</th>
            <th scope="col" className="num-head">Made</th>
            <th scope="col">Horizon</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr key={call.callId}>
              <th scope="row">{call.title}</th>
              <td className="num" data-label="Made">{formatWatchDate(call.madeAt) ?? ''}</td>
              <td data-label="Horizon">{formatWatchDate(call.horizon) ?? call.horizon ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function unlistedOpenCopy(scoreboard: Scoreboard): string | null {
  if (scoreboard.open.length > 0 || scoreboard.openQualitative.length > 0) return null;
  const openCount = scoreboard.totals.open ?? 0;
  const unlisted = openCount - scoreboard.open.length;
  if (unlisted > 0) return `${unlisted} open calls have no fixed due date and are not listed.`;
  return 'No open calls.';
}

export function TrackRecord({ scoreboard }: { scoreboard: Scoreboard | null }) {
  if (!scoreboard) {
    return <EmptyState>No track record yet. Sovs Macro&rsquo;s own calls show up here after the next publish.</EmptyState>;
  }
  const asOf = formatWatchDate(scoreboard.asOf);
  return (
    <>
      <section className="accountability-summary" aria-labelledby="track-rate">
        <p className="accountability-phase">Sovs Macro calls</p>
        <h2 id="track-rate">{headline(scoreboard)}</h2>
        <p className="brief-meta">
          Hit rate is hits divided by hits plus misses.
          {asOf ? ` As of ${asOf}.` : ''}
          {' '}Void and open calls stay listed and stay out of that rate.
        </p>
        <Totals scoreboard={scoreboard} />
      </section>

      <section aria-label="Resolved calls">
        <h2>Recent resolved</h2>
        {scoreboard.recent.length === 0 ? (
          <EmptyState>No resolved calls yet.</EmptyState>
        ) : (
          <div className="panel-table-scroll">
            <table className="panel-table panel-table--stack">
              <caption className="sr-only">Recently resolved Sovs Macro calls</caption>
              <thead>
                <tr>
                  <th scope="col">Call</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num-head">Resolved</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {scoreboard.recent.map((call) => (
                  <tr key={call.callId}>
                    <th scope="row">
                      <CallTitle title={call.title} url={call.url} />
                    </th>
                    <td data-label="Status">
                      <span className={`badge badge-${call.status}`}>{statusLabel(call.status)}</span>
                    </td>
                    <td className="num" data-label="Resolved">{formatWatchDate(call.resolvedAt) ?? ''}</td>
                    <td data-label="Note">{call.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {scoreboard.open.length > 0 ? (
        <section aria-label="Open calls">
          <h2>Open calls</h2>
          {openCallTable(scoreboard.open, 'Open Sovs Macro calls')}
        </section>
      ) : scoreboard.openQualitative.length === 0 ? (
        <section aria-label="Open calls">
          <h2>Open calls</h2>
          <EmptyState>{unlistedOpenCopy(scoreboard)}</EmptyState>
        </section>
      ) : null}

      {scoreboard.openQualitative.length > 0 ? (
        <section aria-label="Open theses">
          <h2>Open theses (no fixed due date)</h2>
          {openCallTable(scoreboard.openQualitative, 'Open Sovs Macro theses with no fixed due date')}
        </section>
      ) : null}
    </>
  );
}
