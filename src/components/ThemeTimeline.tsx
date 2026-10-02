import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { EmptyState } from './EmptyState';

/** Plain-English trigger state. Raw pipeline tokens stay off the page. */
export function triggerStateLabel(state: string): string {
  const key = state.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'not_met') return 'Not yet triggered';
  if (key === 'met') return 'Triggered';
  const words = state.trim().replace(/_+/g, ' ').replace(/\s+/g, ' ');
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

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
      {events.map((e) => {
        const trigger = e.triggerState ? triggerStateLabel(e.triggerState) : '';
        return (
        <li key={e.eventId}>
          <span className={`dir dir-${e.direction}`}>{e.direction}</span>{' '}
          {hasBrief.has(e.date) ? (
            <Link className="date" href={`/briefs/${e.date}`}>
              {formatDate(e.date)}
            </Link>
          ) : (
            <span className="date">{formatDate(e.date)}</span>
          )}
          <p className="evidence">{e.evidence}</p>
          <p className="meta">
            {e.source === 'weekly' ? 'weekend review' : 'daily brief'}
            {trigger ? ` · triggers: ${trigger}` : ''}
            {e.nextCheck ? ` · next check: ${e.nextCheck}` : ''}
          </p>
        </li>
        );
      })}
    </ol>
  );
}
