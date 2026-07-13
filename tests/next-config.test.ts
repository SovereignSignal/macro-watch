import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('Next.js security headers', () => {
  it('disables the framework disclosure header', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('sets browser security headers on every response', async () => {
    expect(nextConfig.headers).toBeTypeOf('function');
    const rules = await nextConfig.headers!();
    const catchAll = rules.find((rule) => rule.source === '/:path*');
    expect(catchAll).toBeDefined();

    const headers = Object.fromEntries(catchAll!.headers.map(({ key, value }) => [key.toLowerCase(), value]));
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['strict-transport-security']).toContain('max-age=31536000');

    const csp = headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/script-src[^;]*https:/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
  });
});
