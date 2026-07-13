import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BriefArticle } from '@/components/BriefArticle';
import { getDb } from '@/db/client';
import { getBriefByDate } from '@/lib/queries/briefs';
import { sanitizePublicBriefText } from '@/lib/security/public-brief-html';

export const revalidate = 900;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_RE.test(date)) return { title: 'Brief' };
  const brief = await getBriefByDate(getDb(), date);
  if (!brief) return { title: 'Brief' };
  const description = sanitizePublicBriefText(brief.ping).slice(0, 220) || brief.subject;
  return {
    title: brief.subject,
    description,
    alternates: { canonical: `/briefs/${date}` },
    openGraph: {
      type: 'article',
      title: brief.subject,
      description,
      url: `/briefs/${date}`,
      publishedTime: brief.sentVerifiedAt.toISOString(),
    },
  };
}

export default async function BriefPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();
  // Deliberately NOT safeQuery: if the DB is briefly down during background
  // revalidation, throwing keeps the previously rendered page serving
  // (ISR stale-on-error) instead of replacing it with a 404.
  const brief = await getBriefByDate(getDb(), date);
  if (!brief) notFound();
  return (
    <main className="container">
      <BriefArticle brief={brief} />
    </main>
  );
}
