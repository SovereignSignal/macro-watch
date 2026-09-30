'use client';

import { useEffect, useState } from 'react';
import { formatAgo, formatUtcStamp } from '@/lib/format';

/**
 * "updated Nm ago" badge from a snapshot's taken_at (spec §6).
 * Renders a neutral placeholder until mounted (no hydration mismatch),
 * then ticks every 60s.
 */
export function UpdatedAgo({ takenAt, lead = 'updated' }: { takenAt: string; lead?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="chip updated-ago" title={new Date(takenAt).toUTCString()}>
      {now === null
        ? `${lead} ${formatUtcStamp(takenAt)}`
        : `${lead} ${formatAgo(new Date(takenAt).getTime(), now)}`}
    </span>
  );
}
