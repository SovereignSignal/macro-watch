import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as login } from '@/app/api/member/login/route';
import { POST as logout } from '@/app/api/member/logout/route';

const KEYS = ['SITE_MEMBER_PASSWORD', 'SITE_MEMBER_SECRET'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  process.env.SITE_MEMBER_PASSWORD = 'correct horse battery';
  process.env.SITE_MEMBER_SECRET = 'test-secret';
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function loginRequest(fields: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request('http://localhost/api/member/login', { method: 'POST', body: form });
}

describe('POST /api/member/login', () => {
  it('signs in with the correct password', async () => {
    const res = await login(loginRequest({ password: 'correct horse battery', next: '/track-record' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/track-record');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/sm_member=\d+\.[0-9a-f]{64}/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=2592000/i);
  });

  it('works with a urlencoded body too', async () => {
    const req = new Request('http://localhost/api/member/login', {
      method: 'POST',
      body: new URLSearchParams({ password: 'correct horse battery', next: '/accountability?kind=map' }),
    });
    const res = await login(req);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/accountability?kind=map');
    expect(res.headers.get('set-cookie') ?? '').toContain('sm_member=');
  });

  it('goes home when next is missing', async () => {
    const res = await login(loginRequest({ password: 'correct horse battery' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/');
  });

  it('rejects a wrong password with signin=failed and no cookie', async () => {
    const res = await login(loginRequest({ password: 'nope', next: '/track-record' }));
    expect(res.status).toBe(303);
    const location = res.headers.get('location') ?? '';
    expect(location).toBe('/track-record?signin=failed');
    expect(location).toContain('signin=failed');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).not.toContain('sm_member');
  });

  it('rejects a missing password', async () => {
    const res = await login(loginRequest({ next: '/track-record' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('signin=failed');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('merges signin=failed into an existing query', async () => {
    const res = await login(loginRequest({ password: 'nope', next: '/accountability?kind=map' }));
    expect(res.headers.get('location')).toBe('/accountability?kind=map&signin=failed');
  });

  it('keeps an open-redirect next on site after success', async () => {
    for (const evil of ['//evil.com', 'https://evil.com', '/\\evil.com']) {
      const res = await login(loginRequest({ password: 'correct horse battery', next: evil }));
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/');
    }
  });

  it('keeps an open-redirect next on site after failure', async () => {
    const res = await login(loginRequest({ password: 'nope', next: '//evil.com' }));
    expect(res.status).toBe(303);
    const location = res.headers.get('location') ?? '';
    expect(location).toBe('/?signin=failed');
    expect(location).not.toContain('evil.com');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('fails closed when SITE_MEMBER_PASSWORD is unset', async () => {
    delete process.env.SITE_MEMBER_PASSWORD;
    delete process.env.SITE_MEMBER_SECRET;
    for (const password of ['', 'anything', 'correct horse battery']) {
      const res = await login(loginRequest({ password, next: '/track-record' }));
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/track-record?signin=failed');
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  it('treats an unparseable body as a failed sign-in', async () => {
    const req = new Request('http://localhost/api/member/login', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'garbage',
    });
    const res = await login(req);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/?signin=failed');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('POST /api/member/logout', () => {
  it('clears the cookie and redirects home', async () => {
    const res = await logout();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/sm_member=;/);
    expect(cookie).toMatch(/Max-Age=0/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\//i);
  });
});
