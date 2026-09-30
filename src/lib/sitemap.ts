import { getDb } from '@/db/client';
import { briefPath } from '@/lib/brief-kind';
import { xmlEscape } from '@/lib/format';
import { listBriefs } from '@/lib/queries/briefs';
import { getThemeMapCards } from '@/lib/queries/map';
import { listResearch } from '@/lib/queries/research';
import { safeQuery } from '@/lib/safe';
import { siteUrl } from '@/lib/site-url';

const STATIC_PATHS = ['/', '/briefs', '/research', '/map', '/track-record', '/accountability', '/catalysts', '/about', '/search'];

function urlEntry(loc: string, lastmod?: Date): string {
  const last = lastmod ? `\n    <lastmod>${xmlEscape(lastmod.toISOString())}</lastmod>` : '';
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>${last}\n  </url>`;
}

/** Sitemap of public pages. Database failures still emit the static routes. */
export async function buildSitemap(): Promise<string> {
  const base = siteUrl();
  const db = getDb();
  const [briefs, research, map] = await Promise.all([
    safeQuery(() => listBriefs(db, { limit: 500 }), []),
    safeQuery(() => listResearch(db, { limit: 500 }), []),
    safeQuery(() => getThemeMapCards(db), { takenAt: null, cards: [], asOf: null }),
  ]);
  const entries = [
    ...STATIC_PATHS.map((path) => urlEntry(path === '/' ? `${base}/` : `${base}${path}`)),
    ...briefs.map((brief) => urlEntry(
      `${base}${briefPath(brief.date, brief.kind, brief.subject)}`,
      brief.sentVerifiedAt,
    )),
    ...research.map((memo) => urlEntry(`${base}/research/${memo.date}`, memo.generatedAt)),
    ...map.cards.map((card) => urlEntry(`${base}/map/${card.slug}`)),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

export function buildRobots(): string {
  const base = siteUrl();
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}
