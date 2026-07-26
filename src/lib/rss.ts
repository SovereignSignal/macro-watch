import { xmlEscape } from './format';
import type { BriefListItem } from './queries/briefs';
import { sanitizePublicBriefText } from './security/public-brief-html';

export function siteUrl(): string {
  return (process.env.SITE_URL ?? 'https://web-production-cb2e81.up.railway.app').replace(/\/$/, '');
}

/** RSS 2.0 of briefs: title = subject, body = ping + link (spec §5). */
export function buildFeed(items: BriefListItem[]): string {
  const base = siteUrl();
  const entries = items
    .map((b) => {
      const link = `${base}/briefs/${b.date}`;
      return [
        '    <item>',
        `      <title>${xmlEscape(sanitizePublicBriefText(b.subject))}</title>`,
        `      <link>${link}</link>`,
        `      <guid isPermaLink="true">${link}</guid>`,
        `      <pubDate>${b.sentVerifiedAt.toUTCString()}</pubDate>`,
        `      <description>${xmlEscape(`${sanitizePublicBriefText(b.ping)}\n\n${link}`)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>Sovs Macro</title>',
    `    <link>${base}</link>`,
    '    <description>Daily macro briefs from Sovs Macro, a Sovereign Signal project.</description>',
    '    <language>en</language>',
    entries,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
