import Link from 'next/link';
import { requiresForecastReview } from '@/lib/scoring';
import {
  claimSource,
  claimTrackLabel,
  payloadStr,
  qualityLabel,
  STATUS_COPY,
  statusLabel,
} from '@/lib/claim-display';
import { mapThemeHref, publicThemeLabel } from '@/lib/theme-display';
import { formatDate } from '@/lib/format';
import type { ClaimFilters, ClaimsPage } from '@/lib/queries/accountability';
import { openingProbability, qualityClass } from '@/lib/scoring';
import { EmptyState } from './EmptyState';
import { StatusMark } from './StatusMark';

const KINDS = ['smart_money', 'map'];
// Pipeline vocabulary (schema.ts / ingest/claims.ts), distinct from the site-plan
// draft's open/resolved_correct/resolved_incorrect/invalidated.
const STATUSES = ['pending', 'hit', 'miss', 'partial', 'expired', 'judgment-required', 'void'];

const RESULT_FALLBACK: Record<string, string> = {
  pending: 'Pending result.',
  expired: 'No verified result.',
  'judgment-required': 'No market can settle this. Excluded from stats.',
  void: 'Excluded from stats.',
};

/** Ledger URL for a page, carrying the active filters. Page 1 stays canonical. */
function ledgerHref(filters: ClaimFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.status) params.set('status', filters.status);
  if (filters.theme) params.set('theme', filters.theme);
  if (filters.qualityClass) params.set('class', filters.qualityClass);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/accountability?${qs}` : '/accountability';
}

/**
 * Filterable claims ledger, one page at a time. Plain GET form and plain
 * links, no client JS. The filter form omits `page`, so changing a filter
 * lands on that filter's first page.
 */
export function ClaimsTable(props: {
  page: ClaimsPage;
  filters: ClaimFilters;
  themeOptions: string[];
  classOptions: string[];
  themeNames: Record<string, string>;
}) {
  const { rows, total, page, pageSize } = props.page;
  const hasFilters = Boolean(
    props.filters.kind || props.filters.status || props.filters.theme || props.filters.qualityClass,
  );
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const hasOlder = to < total;
  return (
    <>
      <form method="get" action="/accountability" className="filters">
        <label>
          Track
          <select name="kind" defaultValue={props.filters.kind ?? ''}>
            <option value="">all</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k === 'smart_money' ? 'wallet markets' : 'map markets'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={props.filters.status ?? ''}>
            <option value="">all</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Theme
          <select name="theme" defaultValue={props.filters.theme ?? ''}>
            <option value="">all</option>
            {props.themeOptions.map((t) => (
              <option key={t} value={t}>
                {publicThemeLabel(t, props.themeNames)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Evidence type
          <select name="class" defaultValue={props.filters.qualityClass ?? ''}>
            <option value="">all</option>
            {props.classOptions.map((c) => (
              <option key={c} value={c}>
                {qualityLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filter</button>
        {hasFilters ? <Link href="/accountability">Clear filters</Link> : null}
      </form>
      {rows.length === 0 ? (
        <EmptyState>No claims match these filters.</EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data-table data-table--claims">
          <thead>
            <tr>
              <th>Opened</th>
              <th>Claim / source</th>
              <th>Track</th>
              <th>Themes</th>
              <th>Evidence</th>
              <th>Expected</th>
              <th>State</th>
              <th>Verified result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const source = claimSource(c);
              const probability = openingProbability(c.payload);
              const resolution = payloadStr(c.payload, 'resolution_note');
              return (
                <tr key={c.claimId}>
                  <td className="cell-mono" data-label="Opened">{formatDate(c.openedAt)}</td>
                  <td data-label="Claim">
                    <span className="claim-predicate">{payloadStr(c.payload, 'predicate') || c.claimId}</span>
                    {source ? (
                      <span className="claim-meta-line">
                        Source:{' '}
                        {source.href ? (
                          <a href={source.href} target="_blank" rel="noreferrer">
                            {source.label}
                          </a>
                        ) : (
                          source.label
                        )}
                      </span>
                    ) : null}
                    {probability !== null ? (
                      <span className="claim-meta-line">Opening probability: {Math.round(probability * 100)}%</span>
                    ) : null}
                  </td>
                  <td className="cell-mono" data-label="Track">{claimTrackLabel(c)}</td>
                  <td className="claim-themes" data-label="Themes">
                    {c.themes.length > 0
                      ? c.themes.map((theme, index) => {
                          const label = publicThemeLabel(theme, props.themeNames);
                          const href = mapThemeHref(theme, props.themeNames);
                          return (
                            <span key={theme}>
                              {index > 0 ? ', ' : ''}
                              {href ? <Link href={href}>{label}</Link> : label}
                            </span>
                          );
                        })
                      : 'Unassigned'}
                  </td>
                  <td className="cell-mono" data-label="Evidence">{qualityLabel(qualityClass(c.payload))}</td>
                  <td className="cell-mono" data-label="Expected">{c.expiresAt ? formatDate(c.expiresAt) : 'No due date'}</td>
                  <td data-label="State">
                    <span className={`status-chip status-chip--${c.status}`}>
                      <StatusMark status={c.status} size={12} decorative />
                      {requiresForecastReview(c.payload) ? 'Excluded from forecast score' : statusLabel(c.status)}
                    </span>
                  </td>
                  <td data-label="Result">
                    {c.resolvedAt ? <span className="claim-meta-line">{formatDate(c.resolvedAt)}</span> : null}
                    {resolution || (c.resolvedAt ? 'Outcome recorded.' : RESULT_FALLBACK[c.status] ?? STATUS_COPY[c.status]?.description ?? 'No result recorded.')}
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      )}
      {total > 0 ? (
        <nav className="archive-pagination ledger-pagination" aria-label="Ledger pagination">
          {page > 1 ? (
            <Link rel="prev" href={ledgerHref(props.filters, page - 1)}>
              ← Newer entries
            </Link>
          ) : (
            <span />
          )}
          <span className="ledger-range">{`rows ${from} to ${to} of ${total}`}</span>
          {hasOlder ? (
            <Link rel="next" href={ledgerHref(props.filters, page + 1)}>
              Older entries →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
