import type { ClaimFilters, ClaimRecord } from '@/lib/queries/accountability';
import { qualityClass } from '@/lib/scoring';
import { EmptyState } from './EmptyState';

const KINDS = ['smart_money', 'map'];
// Pipeline vocabulary (schema.ts / ingest/claims.ts) — not the site-plan
// draft's open/resolved_correct/resolved_incorrect/invalidated.
const STATUSES = ['pending', 'hit', 'miss', 'partial', 'expired', 'judgment-required', 'void'];

function payloadStr(payload: unknown, key: string): string {
  if (typeof payload !== 'object' || payload === null) return '';
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}

/** Filterable claims ledger. Plain GET form — no client JS, house restraint. */
export function ClaimsTable(props: {
  claims: ClaimRecord[];
  filters: ClaimFilters;
  themeOptions: string[];
  classOptions: string[];
}) {
  return (
    <>
      <form method="get" action="/accountability" className="filters">
        <label>
          Kind
          <select name="kind" defaultValue={props.filters.kind ?? ''}>
            <option value="">all</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replaceAll('_', ' ')}
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
                {s.replaceAll('-', ' ')}
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
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Class
          <select name="class" defaultValue={props.filters.qualityClass ?? ''}>
            <option value="">all</option>
            {props.classOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      {props.claims.length === 0 ? (
        <EmptyState>No claims match these filters.</EmptyState>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Opened</th>
              <th>Predicate</th>
              <th>Kind</th>
              <th>Themes</th>
              <th>Class</th>
              <th>Expires</th>
              <th>Status</th>
              <th>Resolution</th>
            </tr>
          </thead>
          <tbody>
            {props.claims.map((c) => (
              <tr key={c.claimId}>
                <td>{c.openedAt}</td>
                <td>
                  {payloadStr(c.payload, 'predicate') || c.claimId}
                  {payloadStr(c.payload, 'data_anchor') ? (
                    <span className="panel-note"> — anchor: {payloadStr(c.payload, 'data_anchor')}</span>
                  ) : null}
                </td>
                <td>{c.kind.replaceAll('_', ' ')}</td>
                <td>{c.themes.join(', ')}</td>
                <td>{qualityClass(c.payload)}</td>
                <td>{c.expiresAt ?? '—'}</td>
                <td className={`status-${c.status}`}>{c.status.replaceAll('-', ' ')}</td>
                <td>
                  {c.resolvedAt
                    ? `${c.resolvedAt}${
                        payloadStr(c.payload, 'resolution_note')
                          ? ` — ${payloadStr(c.payload, 'resolution_note')}`
                          : ''
                      }`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
