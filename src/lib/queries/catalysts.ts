import { asc } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { forwardEvents } from '@/db/schema';
import { publicText } from '@/lib/public-copy';

export type ForwardEventRow = typeof forwardEvents.$inferSelect;

export async function getForwardEvents(
  db: Db,
): Promise<{ upcoming: ForwardEventRow[]; resolved: ForwardEventRow[] }> {
  const rows = await db.select().from(forwardEvents).orderBy(asc(forwardEvents.eventDate));
  return {
    upcoming: rows.filter((r) => r.resolution == null),
    resolved: rows.filter((r) => r.resolution != null).reverse(),
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? publicText(v) : '';
}

function safeHttpsUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function catalystFields(payload: unknown): {
  event: string;
  expectation: string;
  surprise: string;
  sourceTitle: string;
  sourceUrl: string | null;
} {
  const p = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
  return {
    event: str(p.event),
    expectation: str(p.expectation),
    surprise: str(p.surprise),
    sourceTitle: str(p.source_title),
    sourceUrl: safeHttpsUrl(p.source_url),
  };
}

export function resolutionFields(res: unknown): {
  outcome: string;
  resolvedAt: string | null;
  note: string | null;
} {
  const r = (typeof res === 'object' && res !== null ? res : {}) as Record<string, unknown>;
  return {
    outcome: str(r.outcome),
    resolvedAt: typeof r.resolved_at === 'string' ? r.resolved_at : null,
    note: typeof r.note === 'string' ? publicText(r.note) : null,
  };
}
