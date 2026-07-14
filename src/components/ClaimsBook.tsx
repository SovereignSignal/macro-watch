import type { ClaimRecord } from '@/lib/queries/accountability';
import { payloadStr } from '@/lib/claim-display';
import { EmptyState } from './EmptyState';
import { STATUS_LABEL, STATUS_ORDER, StatusMark } from './StatusMark';

function cellTitle(c: ClaimRecord): string {
  const predicate = payloadStr(c.payload, 'predicate') || c.claimId;
  const label = STATUS_LABEL[c.status as keyof typeof STATUS_LABEL] ?? c.status;
  const dates = [`opened ${c.openedAt}`];
  if (c.resolvedAt) dates.push(`resolved ${c.resolvedAt}`);
  else if (c.expiresAt) dates.push(`expires ${c.expiresAt}`);
  else dates.push('open-ended');
  return `${predicate}: ${label}, ${dates.join(', ')}`;
}

/**
 * "The book" is the whole claims ledger as a unit grid, one cell per claim
 * (spec §5: no memory-holing; every claim ever opened stays on the wall).
 * Cells are chronological (oldest first), split by track, and each carries
 * a native SVG tooltip. Status = glyph + color, never color alone.
 */
export function ClaimsBook({ claims }: { claims: ClaimRecord[] }) {
  if (claims.length === 0) {
    return <EmptyState>No claims yet.</EmptyState>;
  }
  const counts = new Map<string, number>(STATUS_ORDER.map((s) => [s, 0]));
  for (const c of claims) {
    if (counts.has(c.status)) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  }
  const sorted = [...claims].sort(
    (a, b) => a.openedAt.localeCompare(b.openedAt) || a.claimId.localeCompare(b.claimId),
  );
  const tracks: [string, ClaimRecord[]][] = [
    ['Wallet signals', sorted.filter((c) => c.kind === 'smart_money')],
    ['Map calls', sorted.filter((c) => c.kind === 'map')],
  ];
  return (
    <div className="book">
      <div className="book-legend">
        {STATUS_ORDER.map((s) => {
          const n = counts.get(s) ?? 0;
          return (
            <span key={s} className={n === 0 ? 'legend-item legend-zero' : 'legend-item'}>
              <StatusMark status={s} size={13} decorative />
              {STATUS_LABEL[s]} <span className="legend-count">{n}</span>
            </span>
          );
        })}
      </div>
      <div className="book-tracks">
        {tracks.map(([name, list]) => (
          <div className="book-track" key={name}>
            <p className="book-eyebrow">
              {name} <span className="book-count">{list.length}</span>
            </p>
            {list.length === 0 ? (
              <p className="panel-note">No claims yet.</p>
            ) : (
              <div className="book-grid">
                {list.map((c) => (
                  <StatusMark key={c.claimId} status={c.status} size={16} title={cellTitle(c)} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
