import { NextResponse } from 'next/server';
import {
  checkPassword,
  MEMBER_COOKIE,
  MEMBER_MAX_AGE,
  memberCookieOptions,
  safeNextPath,
  signToken,
  withSigninFailed,
} from '@/lib/member-auth';

export const dynamic = 'force-dynamic';

// Relative Location on purpose: behind a proxy, request.url may carry an
// internal host, and browsers resolve a relative redirect against the real one.
function see(location: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { location, 'cache-control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const password = form?.get('password');
  const next = safeNextPath(form?.get('next'));

  if (!(await checkPassword(password))) return see(withSigninFailed(next));

  const token = await signToken(Math.floor(Date.now() / 1000) + MEMBER_MAX_AGE);
  const response = see(next);
  response.cookies.set(MEMBER_COOKIE, token, memberCookieOptions());
  return response;
}
