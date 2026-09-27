import { getDb } from '@/db/client';
import { listBriefs } from '@/lib/queries/briefs';
import { buildFeed } from '@/lib/rss';
import { safeQuery } from '@/lib/safe';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const items = await safeQuery(() => listBriefs(getDb(), { limit: 200 }), []);
  return new Response(buildFeed(items), {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}
