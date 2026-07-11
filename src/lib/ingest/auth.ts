import { timingSafeEqual } from 'node:crypto';

/**
 * Single bearer token guards all ingest (spec §2). Timing-safe compare;
 * fails closed if MACRO_WATCH_INGEST_TOKEN is unset.
 */
export function isAuthorized(req: Request): boolean {
  const expected = process.env.MACRO_WATCH_INGEST_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  const got = Buffer.from(header.slice('Bearer '.length));
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}
