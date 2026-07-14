const EM_DASH_RE = /\s*(?:\u2014|&mdash;|&#8212;|&#x2014;)\s*/gi;

/** Public copy contract: em dashes are normalized at ingest and render boundaries. */
export function publicText(value: string): string {
  return value.replace(EM_DASH_RE, ', ').replace(/,\s{2,}/g, ', ');
}

/** Accepts only public HTTPS links for source attribution. */
export function publicHttpsUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'notion.so' ||
    hostname.endsWith('.notion.so') ||
    hostname === 'notion.site' ||
    hostname.endsWith('.notion.site') ||
    hostname === 'notion.com' ||
    hostname.endsWith('.notion.com')
  ) {
    return null;
  }

  const ipv4 = hostname.split('.').map(Number);
  if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [first, second] = ipv4;
    if (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    ) {
      return null;
    }
  }
  if (
    hostname === '::' ||
    hostname === '::1' ||
    hostname.startsWith('fc') ||
    hostname.startsWith('fd') ||
    /^fe[89ab]/.test(hostname) ||
    hostname.startsWith('::ffff:')
  ) {
    return null;
  }

  return url.toString();
}

/** Recursively normalizes strings inside public JSON payloads. */
export function publicValue<T>(value: T): T {
  if (typeof value === 'string') return publicText(value) as T;
  if (Array.isArray(value)) return value.map((item) => publicValue(item)) as T;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, publicValue(item)]),
    ) as T;
  }
  return value;
}
