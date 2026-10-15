import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkPassword,
  isMemberCookie,
  MEMBER_COOKIE,
  MEMBER_MAX_AGE,
  memberCookieOptions,
  memberSigninAvailable,
  safeNextPath,
  signToken,
  verifyToken,
  withSigninFailed,
} from '@/lib/member-auth';

const KEYS = ['SITE_MEMBER_PASSWORD', 'SITE_MEMBER_SECRET'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  process.env.SITE_MEMBER_PASSWORD = 'correct horse battery';
  delete process.env.SITE_MEMBER_SECRET;
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllEnvs();
});

const NOW = 1_800_000_000;

describe('tokens', () => {
  it('signs `${expiry}.${hex hmac}` and verifies it', async () => {
    const token = await signToken(NOW + 100);
    expect(token).toMatch(new RegExp(`^${NOW + 100}\\.[0-9a-f]{64}$`));
    expect(await verifyToken(token, NOW)).toBe(true);
    expect(await isMemberCookie(await signToken(Math.floor(Date.now() / 1000) + 60))).toBe(true);
  });

  it('rejects an expired token, including one expiring exactly now', async () => {
    const token = await signToken(NOW + 100);
    expect(await verifyToken(token, NOW + 101)).toBe(false);
    expect(await verifyToken(token, NOW + 100)).toBe(false);
    expect(await isMemberCookie(await signToken(Math.floor(Date.now() / 1000) - 5))).toBe(false);
  });

  it('rejects a tampered expiry, signature, or shape', async () => {
    const token = await signToken(NOW + 100);
    const [expiry, sig] = token.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    expect(await verifyToken(`${Number(expiry) + 1000}.${sig}`, NOW)).toBe(false);
    expect(await verifyToken(`${expiry}.${flipped}`, NOW)).toBe(false);
    expect(await verifyToken(`${expiry}.${sig.toUpperCase()}`, NOW)).toBe(false);
    expect(await verifyToken(expiry, NOW)).toBe(false);
    expect(await verifyToken(`${expiry}.`, NOW)).toBe(false);
    expect(await verifyToken('', NOW)).toBe(false);
    expect(await verifyToken(undefined, NOW)).toBe(false);
    expect(await verifyToken(null, NOW)).toBe(false);
    expect(await isMemberCookie('garbage')).toBe(false);
  });

  it('derives the secret from the password when SITE_MEMBER_SECRET is unset', async () => {
    const token = await signToken(NOW + 100);
    process.env.SITE_MEMBER_PASSWORD = 'a different password';
    expect(await verifyToken(token, NOW)).toBe(false);
  });

  it('uses SITE_MEMBER_SECRET when set, independent of the password', async () => {
    process.env.SITE_MEMBER_SECRET = 'secret-one';
    const token = await signToken(NOW + 100);
    process.env.SITE_MEMBER_PASSWORD = 'rotated password';
    expect(await verifyToken(token, NOW)).toBe(true);
    process.env.SITE_MEMBER_SECRET = 'secret-two';
    expect(await verifyToken(token, NOW)).toBe(false);
    delete process.env.SITE_MEMBER_SECRET;
    expect(await verifyToken(token, NOW)).toBe(false);
  });
});

describe('password', () => {
  it('accepts only the exact password', async () => {
    expect(await checkPassword('correct horse battery')).toBe(true);
    expect(await checkPassword('correct horse batterY')).toBe(false);
    expect(await checkPassword('correct horse battery ')).toBe(false);
    expect(await checkPassword('')).toBe(false);
    expect(await checkPassword(null)).toBe(false);
    expect(await checkPassword(undefined)).toBe(false);
    expect(await checkPassword(42)).toBe(false);
  });

  it('fails closed when SITE_MEMBER_PASSWORD is unset or empty', async () => {
    delete process.env.SITE_MEMBER_PASSWORD;
    expect(memberSigninAvailable()).toBe(false);
    expect(await checkPassword('')).toBe(false);
    expect(await checkPassword('anything')).toBe(false);
    expect(await checkPassword(undefined)).toBe(false);
    expect(await verifyToken(`${NOW + 100}.${'0'.repeat(64)}`, NOW)).toBe(false);
    await expect(signToken(NOW + 100)).rejects.toThrow();

    process.env.SITE_MEMBER_PASSWORD = '';
    expect(memberSigninAvailable()).toBe(false);
    expect(await checkPassword('')).toBe(false);
  });

  it('reports sign-in as available when a password is configured', () => {
    expect(memberSigninAvailable()).toBe(true);
  });
});

describe('unset secret and password', () => {
  it('rejects tokens minted before the password was removed', async () => {
    const token = await signToken(NOW + 100);
    delete process.env.SITE_MEMBER_PASSWORD;
    expect(await verifyToken(token, NOW)).toBe(false);
    expect(await isMemberCookie(token)).toBe(false);
  });
});

describe('cookie options', () => {
  it('is httpOnly, SameSite=Lax, path /, 30 days', () => {
    expect(MEMBER_COOKIE).toBe('sm_member');
    expect(MEMBER_MAX_AGE).toBe(2_592_000);
    const options = memberCookieOptions();
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 2_592_000 });
    expect(options.secure).toBe(false);
  });

  it('is Secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(memberCookieOptions().secure).toBe(true);
  });
});

describe('safeNextPath', () => {
  it('keeps same-site absolute paths', () => {
    expect(safeNextPath('/track-record')).toBe('/track-record');
    expect(safeNextPath('/accountability?kind=map&page=2')).toBe('/accountability?kind=map&page=2');
    expect(safeNextPath('/')).toBe('/');
  });

  it('sends everything else home', () => {
    for (const bad of [
      '//evil.example',
      '//evil.example/path',
      'https://evil.example',
      'http://evil.example/track-record',
      'track-record',
      '',
      '/\\evil.example',
      '/ok\nSet-Cookie: x=1',
      '/with\u0000null',
      'javascript:alert(1)',
      '/' + 'a'.repeat(2001),
      null,
      undefined,
      42,
      {},
    ]) {
      expect(safeNextPath(bad)).toBe('/');
    }
  });
});

describe('withSigninFailed', () => {
  it('appends signin=failed, merging queries and dropping fragments', () => {
    expect(withSigninFailed('/track-record')).toBe('/track-record?signin=failed');
    expect(withSigninFailed('/accountability?kind=map')).toBe('/accountability?kind=map&signin=failed');
    expect(withSigninFailed('/track-record#top')).toBe('/track-record?signin=failed');
  });
});
