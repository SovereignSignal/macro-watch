import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { EmptyState } from './EmptyState';

export type TimelineEvent = {
  eventId: string;
  date: string;
  direction: string;
  evidence: string;
  triggerState: string | null;
  nextCheck: string | null;
  source: string;
};

/**
 * Full per-theme event history, newest first. Most events land on days
 * without a published brief, so an entry only links to its source brief
 * permalink when one actually exists for that date (spec §5); otherwise the
 * date renders as plain text.
 */
export function ThemeTimeline({
  events,
  briefDates = [],
}: {
  events: TimelineEvent[];
  briefDates?: string[];
}) {
  if (events.length === 0) return <EmptyState>No events recorded for this theme yet.</EmptyState>;
  const hasBrief = new Set(briefDates);
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.eventId}>
          <span className={`dir dir-${e.direction}`}>{e.direction}</span>{' '}
          {hasBrief.has(e.date) ? (
            <Link href={`/briefs/${e.date}`}>{formatDate(e.date)}</Link>
          ) : (
            <span>{formatDate(e.date)}</span>
          )}
          <p className="evidence">{e.evidence}</p>
          <p className="meta">
            {e.source === 'weekly' ? 'weekend review' : 'daily brief'}
            {e.triggerState ? ` · triggers: ${e.triggerState}` : ''}
            {e.nextCheck ? ` · next check: ${e.nextCheck}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}
