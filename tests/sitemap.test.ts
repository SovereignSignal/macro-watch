import { beforeEach, expect, it } from 'vitest';
import { buildRobots, buildSitemap } from '@/lib/sitemap';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

beforeEach(() => {
  process.env.SITE_URL = 'https://macro-watch-production.up.railway.app';
});

it('robots.txt allows the site, blocks the ingest API, and points at the sitemap', () => {
  const text = buildRobots();
  expect(text).toContain('User-agent: *');
  expect(text).toContain('Allow: /');
  expect(text).toContain('Disallow: /api/');
  expect(text).toContain('Sitemap: https://macro-watch-production.up.railway.app/sitemap.xml');
});

it('sitemap lists static routes, kind permalinks, research, and themes', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const { upsertResearch } = await import('@/lib/ingest/research');
  await upsertResearch(db, {
    date: '2026-08-17',
    topic: 'Dedollarization / BRICS',
    finding: 'The weakest assumption is the binary description of the capital account.',
    changed: 'Evidence now separates reserve shares and settlement.',
    decision: 'Keep the liquid dollar base.',
    watch: 'COFER shares and official Treasury flows.',
    citations: [{ url: 'https://www.imf.org/cofer', title: 'IMF COFER' }],
    generated_at: '2026-08-17T07:04:00Z',
  });
  const xml = await buildSitemap();
  expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  expect(xml).toContain('https://macro-watch-production.up.railway.app/briefs/2026-07-08/daily');
  expect(xml).toContain('https://macro-watch-production.up.railway.app/briefs/2026-07-11/weekend');
  expect(xml).toContain('https://macro-watch-production.up.railway.app/research/2026-08-17');
  expect(xml).toContain('https://macro-watch-production.up.railway.app/map/rate-path-repricing');
  expect(xml).toContain('https://macro-watch-production.up.railway.app/catalysts');
  expect(xml).toContain('https://macro-watch-production.up.railway.app/about');
  expect(xml).not.toContain('/api/');
});

it('sitemap leaves out the members-only pages', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const xml = await buildSitemap();
  expect(xml).not.toContain('/track-record');
  expect(xml).not.toContain('/accountability');
});

it('sitemap route and robots route return the documents', async () => {
  await createTestDb();
  const { GET: sitemap } = await import('@/app/sitemap.xml/route');
  const { GET: robots } = await import('@/app/robots.txt/route');
  const site = await sitemap();
  const bot = robots();
  expect(site.headers.get('content-type')).toContain('application/xml');
  expect(await site.text()).toContain('<urlset');
  expect(bot.headers.get('content-type')).toContain('text/plain');
  expect(await bot.text()).toContain('Disallow: /api/');
});
