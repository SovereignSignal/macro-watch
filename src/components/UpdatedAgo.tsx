'use client';

import { useEffect, useState } from 'react';
import { formatAgo, formatPacificStamp } from '@/lib/format';

function machineDateTime(takenAt: string): string | undefined {
  const parsed = new Date(takenAt);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/**
 * "updated Nm ago" badge from a snapshot's taken_at (spec §6).
 * The first paint is a Pacific clock (PT or PDT). After mount it ticks
 * every 60s. `dateTime` stays the UTC ISO instant.
 */
export function UpdatedAgo({ takenAt, lead = 'updated' }: { takenAt: string; lead?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const iso = machineDateTime(takenAt);
  const takenMs = iso ? new Date(iso).getTime() : Number.NaN;
  return (
    <time className="chip updated-ago" dateTime={iso}>
      {now === null || Number.isNaN(takenMs)
        ? `${lead} ${formatPacificStamp(takenAt)}`
        : `${lead} ${formatAgo(takenMs, now)}`}
    </time>
  );
}
