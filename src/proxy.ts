import { NextResponse, type NextRequest } from 'next/server';

/**
 * Keeps members-only pages out of search indexes and shared caches.
 * Authorization is NOT done here: each gated page checks isMember() itself.
 */
export function proxy(_request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('x-robots-tag', 'noindex');
  response.headers.set('cache-control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/track-record/:path*', '/accountability/:path*'],
};
