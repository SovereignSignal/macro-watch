import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { getResearchByDate } from '@/lib/queries/research';
import { publicResearchText } from '@/lib/research-public';
import { mentionsBlockedPublisher } from '@/lib/security/blocked-publishers';
import { sanitizePublicBriefText } from '@/lib/security/public-brief-html';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Citation = { url?: string; title?: string };

function publicCitations(value: unknown, isoDate: string): { url: string; title: string }[] {
  if (!Array.isArray(value)) return [];
  return (value as Citation[])
    .filter((c) => typeof c?.url === 'string' && c.url.startsWith('https://') && !/example\.com/i.test(c.url))
    .filter((c) => !mentionsBlockedPublisher(c.url ?? '') && !mentionsBlockedPublisher(c.title ?? ''))
    .slice(0, 15)
    .map((c) => {
      const url = c.url as string;
      let host = url;
      try {
        host = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        /* keep raw url */
      }
      return { url, title: publicResearchText(sanitizePublicBriefText(c.title ?? '', isoDate)) || host };
    });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_RE.test(date)) return { title: 'Research memo' };
  const memo = await getResearchByDate(getDb(), date);
  if (!memo) return { title: 'Research memo' };
  const topic = publicResearchText(sanitizePublicBriefText(memo.topic, date)) || 'Research memo';
  const description = publicResearchText(sanitizePublicBriefText(memo.finding, date)).slice(0, 220) || topic;
  return {
    title: `${topic} · research memo`,
    description,
    alternates: { canonical: `/research/${date}` },
    openGraph: {
      type: 'article',
      title: topic,
      description,
      url: `/research/${date}`,
      publishedTime: memo.generatedAt.toISOString(),
    },
  };
}

const SECTIONS = [
  ['Finding', 'finding'],
  ['What changed', 'changed'],
  ['Decision', 'decision'],
  ['Watch next', 'watch'],
] as const;

export default async function ResearchMemoPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();
  // Deliberately NOT safeQuery: if the DB is briefly down during background
  // revalidation, throwing keeps the previously rendered page serving
  // (ISR stale-on-error) instead of replacing it with a 404.
  const memo = await getResearchByDate(getDb(), date);
  if (!memo) notFound();
  const citations = publicCitations(memo.citations, memo.date);
  return (
    <main className="container">
      <article>
        <p className="date">{formatDate(memo.date)} · Decision research</p>
        <h1>{publicResearchText(sanitizePublicBriefText(memo.topic, memo.date)) || 'Research memo'}</h1>
        {SECTIONS.map(([label, key]) => (
          <section key={key}>
            <h2>{label}</h2>
            <p>{publicResearchText(sanitizePublicBriefText(memo[key], memo.date))}</p>
          </section>
        ))}
        {citations.length > 0 ? (
          <section>
            <h2>Sources</h2>
            <ul>
              {citations.map((c) => (
                <li key={c.url}>
                  <a href={c.url} rel="noopener noreferrer" target="_blank">
                    {c.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </main>
  );
}
