/**
 * Wraps page-level reads: a DB failure degrades to an explicit empty state
 * instead of a crashed render (spec §6/§7). Also what lets `next build`
 * prerender with no database reachable (CI).
 */
export async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error('[macro.watch] query failed:', err);
    return fallback;
  }
}
