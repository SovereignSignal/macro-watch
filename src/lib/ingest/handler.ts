import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { getDb, type Db } from '@/db/client';
import { isAuthorized } from './auth';

export type RevalidateTarget = { path: string; type?: 'page' | 'layout' };

/** Upserts report either a bare written-row count or written + stale counts. */
export type UpsertResult = number | { upserted: number; stale: number };

/**
 * Every ingest endpoint is: auth -> JSON parse -> zod -> idempotent upsert
 * -> on-demand revalidation -> {ok, upserted, [stale], revalidated} (spec §3, §6, §7).
 *
 * A stale replay (older revision than stored) is not an error: it answers 200
 * with ok: true so the producer neither retries nor dead-letters it. `stale`
 * defaults to 0 and is only serialized when non-zero.
 */
export function createIngestHandler<S extends z.ZodTypeAny>(opts: {
  schema: S;
  upsert: (db: Db, payload: z.output<S>) => Promise<UpsertResult>;
  revalidate: (payload: z.output<S>) => RevalidateTarget[];
}) {
  return async function POST(req: Request): Promise<Response> {
    if (!isAuthorized(req)) {
      return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, error: 'body is not valid JSON' }, { status: 422 });
    }
    const parsed = opts.schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: 'validation failed', issues: parsed.error.issues },
        { status: 422 },
      );
    }
    const result = await opts.upsert(getDb(), parsed.data);
    const upserted = typeof result === 'number' ? result : result.upserted;
    const stale = typeof result === 'number' ? 0 : result.stale;
    const targets = opts.revalidate(parsed.data);
    for (const t of targets) {
      try {
        revalidatePath(t.path, t.type ?? 'page');
      } catch (err) {
        // revalidatePath is unavailable outside the Next request scope (unit tests).
        console.warn('[sovs-macro] revalidate failed for', t.path, err);
      }
    }
    return Response.json({
      ok: true,
      upserted,
      ...(stale > 0 ? { stale } : {}),
      revalidated: targets.map((t) => t.path),
    });
  };
}
