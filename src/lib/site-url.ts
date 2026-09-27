/** Canonical public origin while macro.watch still points at a different site. */
export const RAILWAY_ORIGIN = 'https://macro-watch-production.up.railway.app';

const REJECTED_HOSTS = new Set(['macro.watch', 'www.macro.watch']);

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Public site origin for RSS, metadata, and canonical links. */
export function siteUrl(): string {
  const raw = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? RAILWAY_ORIGIN).replace(
    /\/$/,
    '',
  );
  const host = hostnameOf(raw);
  if (!host || REJECTED_HOSTS.has(host)) return RAILWAY_ORIGIN;
  return raw;
}
