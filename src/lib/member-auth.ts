/**
 * Members-only gate: pure functions, no Next.js imports, so the same code runs
 * in the proxy, in route handlers, and in tests. Signing uses Web Crypto
 * (`crypto.subtle`), which exists in both the edge-style proxy runtime and Node.
 *
 * Cookie value: `${expiryEpochSeconds}.${hmacSha256Hex(expiryEpochSeconds)}`.
 * Everything fails closed: with no SITE_MEMBER_PASSWORD, nobody can sign in.
 */

export const MEMBER_COOKIE = 'sm_member';
export const MEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when a member password is configured, i.e. sign-in can work at all. */
export function memberSigninAvailable(): boolean {
  return Boolean(process.env.SITE_MEMBER_PASSWORD);
}

/**
 * Cookie signing secret: SITE_MEMBER_SECRET, else derived from the password.
 * Read on every call so a rotated env value takes effect immediately.
 */
function signingSecret(): string | null {
  const explicit = process.env.SITE_MEMBER_SECRET;
  if (explicit) return explicit;
  const password = process.env.SITE_MEMBER_PASSWORD;
  if (password) return `sovs-macro-member-cookie:v1:${password}`;
  return null;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

async function sha256Hex(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

/** Compare two strings without bailing out at the first difference. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Sign an expiry (epoch seconds). Throws when no secret is configured. */
export async function signToken(expiresAt: number): Promise<string> {
  const secret = signingSecret();
  if (!secret) throw new Error('member signing secret is not configured');
  const expiry = String(Math.floor(expiresAt));
  return `${expiry}.${await hmacHex(secret, expiry)}`;
}

const TOKEN_RE = /^(\d{1,12})\.([0-9a-f]{64})$/;

/** Valid signature and not yet expired. Never throws; unset secret means false. */
export async function verifyToken(
  token: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (typeof token !== 'string') return false;
  const secret = signingSecret();
  if (!secret) return false;
  const match = TOKEN_RE.exec(token);
  if (!match) return false;
  const [, expiry, signature] = match;
  const expected = await hmacHex(secret, expiry);
  const signatureOk = constantTimeEqual(signature, expected);
  return signatureOk && Number(expiry) > nowSeconds;
}

/** Whether a raw `sm_member` cookie value is a live member session. */
export async function isMemberCookie(value: string | null | undefined): Promise<boolean> {
  return verifyToken(value);
}

/**
 * Constant-time password check. Both sides are hashed first so neither the
 * content nor the length of the real password leaks through timing.
 * Fails closed when SITE_MEMBER_PASSWORD is unset or empty.
 */
export async function checkPassword(input: unknown): Promise<boolean> {
  const expected = process.env.SITE_MEMBER_PASSWORD;
  if (!expected) return false;
  if (typeof input !== 'string') return false;
  const [a, b] = await Promise.all([sha256Hex(input), sha256Hex(expected)]);
  return constantTimeEqual(a, b);
}

/** Cookie attributes for set and clear. Evaluated per request (Secure in production). */
export function memberCookieOptions(maxAge: number = MEMBER_MAX_AGE) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/**
 * Post-login destination: only a same-site absolute path ("/x", never "//x",
 * no backslashes or control characters). Anything else goes home.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== 'string') return '/';
  if (next.length === 0 || next.length > 2000) return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return '/';
  try {
    const base = 'http://sovs.invalid';
    if (new URL(next, base).origin !== base) return '/';
  } catch {
    return '/';
  }
  return next;
}

/** `${next}?signin=failed`, merging with an existing query and dropping any fragment. */
export function withSigninFailed(next: string): string {
  const [base] = next.split('#');
  return `${base}${base.includes('?') ? '&' : '?'}signin=failed`;
}
