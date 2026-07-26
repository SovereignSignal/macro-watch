import { beforeEach, expect, it } from 'vitest';
import { buildFeed, siteUrl } from '@/lib/rss';

beforeEach(() => {
  process.env.SITE_URL = 'https://web-production-cb2e81.up.railway.app';
});

const ITEM = {
  date: '2026-07-10',
  kind: 'daily',
  subject: 'Rates & the "long" end',
  ping: 'Front-end yields snapped higher.',
  sentVerifiedAt: new Date('2026-07-10T14:05:00Z'),
};

it('builds RSS with title = subject and body = ping + link', () => {
  const xml = buildFeed([ITEM]);
  expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  expect(xml).toContain('<title>Sovs Macro</title>');
  expect(xml).toContain('Sovs Macro, a Sovereign Signal project.');
  expect(xml).toContain('<title>Rates &amp; the &quot;long&quot; end</title>');
  expect(xml).toContain('<link>https://web-production-cb2e81.up.railway.app/briefs/2026-07-10</link>');
  expect(xml).toContain('Front-end yields snapped higher.');
  expect(xml).toContain('https://web-production-cb2e81.up.railway.app/briefs/2026-07-10</description>');
  expect(xml).toContain('<pubDate>Fri, 10 Jul 2026 14:05:00 GMT</pubDate>');
});

it('siteUrl strips a trailing slash and defaults to the configured Railway origin', () => {
  process.env.SITE_URL = 'https://staging.example.com/';
  expect(siteUrl()).toBe('https://staging.example.com');
  delete process.env.SITE_URL;
  expect(siteUrl()).toBe('https://web-production-cb2e81.up.railway.app');
});

it('an empty archive still yields a valid channel', () => {
  const xml = buildFeed([]);
  expect(xml).toContain('<channel>');
  expect(xml).not.toContain('<item>');
});
