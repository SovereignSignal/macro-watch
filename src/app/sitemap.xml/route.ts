import { buildSitemap } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return new Response(await buildSitemap(), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}
