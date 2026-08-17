import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { getResearchByDate } from '@/lib/queries/research';
import { sanitizePublicBriefText } from '@/lib/security/public-brief-html';

export const revalidate = 900;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Citation = { url?: string; title?: string };

function publicCitations(value: unknown): { url: string; title: string }[] {
  if (!Array.isArray(value)) return [];
  return (value as Citation[])
    .filter((c) => typeof c?.url === 'string' && c.url.startsWith('https://'))
    .slice(0, 15)
    .map((c) => {
      const url = c.url as string;
      let host = url;
      try {
        host = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        /* keep raw url */
      }
      return { url, title: sanitizePublicBriefText(c.title ?? '') || host };
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
  const topic = sanitizePublicBriefText(memo.topic) || 'Research memo';
  const description = sanitizePublicBriefText(memo.finding).slice(0, 220) || topic;
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
  const citations = publicCitations(memo.citations);
  return (
    <main className="container">
      <article>
        <p className="date">{formatDate(memo.date)} · Decision research</p>
        <h1>{sanitizePublicBriefText(memo.topic) || 'Research memo'}</h1>
        {SECTIONS.map(([label, key]) => (
          <section key={key}>
            <h2>{label}</h2>
            <p>{sanitizePublicBriefText(memo[key])}</p>
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
