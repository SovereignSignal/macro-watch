import { NextResponse } from 'next/server';
import { MEMBER_COOKIE, memberCookieOptions } from '@/lib/member-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = new NextResponse(null, {
    status: 303,
    headers: { location: '/', 'cache-control': 'no-store' },
  });
  response.cookies.set(MEMBER_COOKIE, '', memberCookieOptions(0));
  return response;
}
