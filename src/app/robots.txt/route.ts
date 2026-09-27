import { buildRobots } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response(buildRobots(), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
