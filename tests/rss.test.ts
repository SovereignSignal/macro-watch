import { beforeEach, expect, it } from 'vitest';
import { buildFeed, siteUrl } from '@/lib/rss';

beforeEach(() => {
  process.env.SITE_URL = 'https://macro-watch-production.up.railway.app';
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
  expect(xml).toContain('<link>https://macro-watch-production.up.railway.app/briefs/2026-07-10/daily</link>');
  expect(xml).toContain('Front-end yields snapped higher.');
  expect(xml).toContain('https://macro-watch-production.up.railway.app/briefs/2026-07-10/daily</description>');
  expect(xml).toContain('<pubDate>Fri, 10 Jul 2026 14:05:00 GMT</pubDate>');
});

it('siteUrl strips a trailing slash and defaults to the configured Railway origin', () => {
  process.env.SITE_URL = 'https://staging.example.com/';
  expect(siteUrl()).toBe('https://staging.example.com');
  delete process.env.SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  expect(siteUrl()).toBe('https://macro-watch-production.up.railway.app');
});

it('siteUrl refuses macro.watch because that host is a different site', () => {
  process.env.SITE_URL = 'https://macro.watch';
  expect(siteUrl()).toBe('https://macro-watch-production.up.railway.app');
});

it('an empty archive still yields a valid channel', () => {
  const xml = buildFeed([]);
  expect(xml).toContain('<channel>');
  expect(xml).not.toContain('<item>');
});
