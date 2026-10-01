import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { seedAll } from '@/lib/seed';
import { briefs } from '@/db/schema';
import { createTestDb } from './helpers/db';

const { default: BriefsPage } = await import('@/app/briefs/page');
const { default: BriefPage, generateMetadata } = await import('@/app/briefs/[date]/page');

it('archive lists every brief newest-first with weekend labels', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await BriefsPage({}));
  expect(markup).toContain('href="/briefs/2026-07-11/weekend"');
  expect(markup).toContain('href="/briefs/2026-07-09/daily"');
  expect(markup).toContain('href="/briefs/2026-07-08/daily"');
  expect(markup).toContain('Weekend review');
  expect(markup.indexOf('2026-07-11')).toBeLessThan(markup.indexOf('2026-07-08')); // newest first
});

it('archive paginates bounded reads with next and previous links', async () => {
  const db = await createTestDb();
  const { upsertBrief } = await import('@/lib/ingest/briefs');
  for (let day = 1; day <= 27; day += 1) {
    const date = `2026-06-${String(day).padStart(2, '0')}`;
    await upsertBrief(db, {
      date,
      kind: 'daily',
      subject: `Brief ${date}`,
      telegram_ping: `Ping ${date}`,
      html: `<p>Body ${date}</p>`,
      sent_verified_at: `${date}T14:00:00Z`,
    });
  }
  const first = renderToStaticMarkup(await BriefsPage({}));
  expect(first).toContain('href="/briefs?page=2"');
  expect(first).not.toContain('Brief 2026-06-01');
  const second = renderToStaticMarkup(await BriefsPage({ searchParams: Promise.resolve({ page: '2' }) }));
  expect(second).toContain('Brief 2026-06-01');
  expect(second).toContain('← Newer briefs');
});

it('brief metadata exposes canonical, description, and article publication time', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const metadata = await generateMetadata({ params: Promise.resolve({ date: '2026-07-08' }) });
  expect(metadata.alternates?.canonical).toBe('/briefs/2026-07-08');
  expect(metadata.description).toContain('Two-year yields');
  expect(metadata.openGraph).toMatchObject({ type: 'article' });
});

it('sanitizes directly inserted legacy subject and ping on archive and metadata paths', async () => {
  const db = await createTestDb();
  await db.insert(briefs).values({
    date: '2026-08-01',
    kind: 'daily',
    subject: 'Legacy analyst&amp;#64;example&amp;#46;com /home/ubuntu/private',
    ping: '📄 View this brief in Notion | 📋 SovsClaw Macro Brief Log — all briefs https://team.notion.so/Secret',
    html: '<p>Public body</p>',
    sentVerifiedAt: new Date('2026-08-01T14:00:00Z'),
  });
  const archive = renderToStaticMarkup(await BriefsPage({}));
  const metadata = await generateMetadata({ params: Promise.resolve({ date: '2026-08-01' }) });
  const combined = `${archive} ${metadata.title} ${metadata.description} ${JSON.stringify(metadata.openGraph)}`;
  expect(combined).not.toMatch(/analyst@example|\/home\/ubuntu|notion\.so/i);
  expect(combined).toContain('[redacted email]');
});

it('archive shows an empty state with no briefs', async () => {
  await createTestDb(); // no seed
  const markup = renderToStaticMarkup(await BriefsPage({}));
  expect(markup).toContain('No briefs yet');
  expect(markup).toContain('14:00 UTC');
  expect(markup).toContain('17:00 UTC');
  expect(markup).toContain('23:00 UTC');
});

it('permalink renders the brief in full', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await BriefPage({ params: Promise.resolve({ date: '2026-07-08' }) }));
  expect(markup).toContain('Front-end repricing meets a heavy auction week');
  expect(markup).toContain('Term premium models'); // deep research section of the html
  expect((markup.match(/<h1/g) ?? [])).toHaveLength(1);
});

it('permalink 404s for a missing or malformed date', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await expect(BriefPage({ params: Promise.resolve({ date: '1900-01-01' }) })).rejects.toThrow();
  await expect(BriefPage({ params: Promise.resolve({ date: 'not-a-date' }) })).rejects.toThrow();
});

it('kind permalink renders the matching brief and redirects an unknown kind', async () => {
  const db = await createTestDb();
  const { upsertBrief } = await import('@/lib/ingest/briefs');
  await upsertBrief(db, {
    date: '2026-09-17',
    kind: 'daily',
    subject: 'Thursday tape',
    telegram_ping: 'The daily read.',
    html: '<p>Daily body.</p>',
    sent_verified_at: '2026-09-17T14:00:00Z',
  });
  await upsertBrief(db, {
    date: '2026-09-17',
    kind: 'week-ahead',
    subject: 'Week ahead: supply',
    telegram_ping: 'The week opens into supply.',
    html: '<p>Week ahead body.</p>',
    sent_verified_at: '2026-09-17T23:00:00Z',
  });
  const { default: BriefKindPage, generateMetadata: kindMetadata } = await import('@/app/briefs/[date]/[kind]/page');
  const markup = renderToStaticMarkup(
    await BriefKindPage({ params: Promise.resolve({ date: '2026-09-17', kind: 'week-ahead' }) }),
  );
  expect(markup).toContain('Week ahead body.');
  expect(markup).not.toContain('Daily body.');
  const metadata = await kindMetadata({ params: Promise.resolve({ date: '2026-09-17', kind: 'daily' }) });
  expect(metadata.alternates?.canonical).toBe('/briefs/2026-09-17/daily');
  await expect(
    BriefKindPage({ params: Promise.resolve({ date: '2026-09-17', kind: 'weekend' }) }),
  ).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;/briefs/2026-09-17;308;' });
  await expect(
    BriefKindPage({ params: Promise.resolve({ date: '2026-09-17', kind: 'monthly' }) }),
  ).rejects.toThrow();
});

it('a date with several kinds shows a chooser and a legacy week-ahead subject still resolves', async () => {
  const db = await createTestDb();
  const { upsertBrief } = await import('@/lib/ingest/briefs');
  await upsertBrief(db, {
    date: '2026-08-23',
    kind: 'weekend',
    subject: 'Week Ahead, Sunday, August 23, 2026',
    telegram_ping: 'Watch CPI.',
    html: '<p>Sunday note.</p>',
    sent_verified_at: '2026-08-23T23:00:00Z',
  });
  await upsertBrief(db, {
    date: '2026-08-23',
    kind: 'daily',
    subject: 'Saturday shadow',
    telegram_ping: 'A second note.',
    html: '<p>Shadow body.</p>',
    sent_verified_at: '2026-08-23T16:00:00Z',
  });
  const chooser = renderToStaticMarkup(await BriefPage({ params: Promise.resolve({ date: '2026-08-23' }) }));
  expect(chooser).toContain('Choose a kind');
  expect(chooser).toContain('href="/briefs/2026-08-23/week-ahead"');
  expect(chooser).toContain('href="/briefs/2026-08-23/daily"');
  const { default: BriefKindPage } = await import('@/app/briefs/[date]/[kind]/page');
  const ahead = renderToStaticMarkup(
    await BriefKindPage({ params: Promise.resolve({ date: '2026-08-23', kind: 'week-ahead' }) }),
  );
  expect(ahead).toContain('Sunday note.');
});

it('archive groups months, filters by kind, and pages a large set', async () => {
  const db = await createTestDb();
  const { upsertBrief } = await import('@/lib/ingest/briefs');
  for (let day = 1; day <= 120; day += 1) {
    const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
    const kind = day % 7 === 0 ? 'weekend' : day % 7 === 6 ? 'week-ahead' : 'daily';
    await upsertBrief(db, {
      date,
      kind,
      subject: kind === 'week-ahead' ? `Week ahead ${date}` : `Brief ${date}`,
      telegram_ping: `Ping ${date}`,
      html: `<p>Body ${date}</p>`,
      sent_verified_at: `${date}T14:00:00Z`,
    });
  }
  const first = renderToStaticMarkup(await BriefsPage({}));
  expect(first).toContain('April 2026');
  expect(first).toContain('href="/briefs?page=2"');
  expect(first).toContain('href="/briefs?kind=week-ahead"');
  const filtered = renderToStaticMarkup(
    await BriefsPage({ searchParams: Promise.resolve({ kind: 'week-ahead' }) }),
  );
  expect(filtered).toContain('Week ahead 2026-04-28');
  expect(filtered).not.toContain('Brief 2026-');
  const last = renderToStaticMarkup(await BriefsPage({ searchParams: Promise.resolve({ page: '5' }) }));
  expect(last).toContain('Brief 2026-01-01');
  expect(last).toContain('January 2026');
  expect(last).toContain('href="/briefs?page=4"');
  expect(last).not.toContain('href="/briefs?page=6"');
});

it('pre-2000 sentinel briefs never appear in listings or latest, but permalink still renders', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const { upsertBrief } = await import('@/lib/ingest/briefs');
  await upsertBrief(db, {
    date: '1999-01-01',
    kind: 'daily',
    subject: 'Smoke test brief (sentinel — not market content)',
    telegram_ping: 'sentinel',
    html: '<p>sentinel</p>',
    sent_verified_at: '1999-01-01T00:00:00Z',
  });
  const { getLatestBrief, listBriefs, getBriefByDate } = await import('@/lib/queries/briefs');
  const latest = await getLatestBrief(db);
  expect(latest?.date).not.toBe('1999-01-01');
  const list = await listBriefs(db);
  expect(list.some((b) => b.date === '1999-01-01')).toBe(false);
  const direct = await getBriefByDate(db, '1999-01-01');
  expect(direct?.subject).toContain('sentinel');
});
