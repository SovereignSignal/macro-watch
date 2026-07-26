import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { getDb, type Db } from '@/db/client';
import { isAuthorized } from './auth';

export type RevalidateTarget = { path: string; type?: 'page' | 'layout' };

/**
 * Every ingest endpoint is: auth -> JSON parse -> zod -> idempotent upsert
 * -> on-demand revalidation -> {ok, upserted, revalidated} (spec §3, §6, §7).
 */
export function createIngestHandler<S extends z.ZodTypeAny>(opts: {
  schema: S;
  upsert: (db: Db, payload: z.output<S>) => Promise<number>;
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
    const upserted = await opts.upsert(getDb(), parsed.data);
    const targets = opts.revalidate(parsed.data);
    for (const t of targets) {
      try {
        revalidatePath(t.path, t.type ?? 'page');
      } catch (err) {
        // revalidatePath is unavailable outside the Next request scope (unit tests).
        console.warn('[sovs-macro] revalidate failed for', t.path, err);
      }
    }
    return Response.json({ ok: true, upserted, revalidated: targets.map((t) => t.path) });
  };
}
