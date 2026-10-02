import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { BriefArticle } from '@/components/BriefArticle';
import { getDb } from '@/db/client';
import { isBriefKind, pickBriefForKind } from '@/lib/brief-kind';
import { listBriefsForDate } from '@/lib/queries/briefs';
import { sanitizePublicBriefText } from '@/lib/security/public-brief-html';

export const revalidate = 900;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string; kind: string }>;
}): Promise<Metadata> {
  const { date, kind } = await params;
  if (!DATE_RE.test(date) || !isBriefKind(kind)) return { title: 'Brief' };
  const brief = pickBriefForKind(await listBriefsForDate(getDb(), date), kind);
  if (!brief) return { title: 'Brief' };
  const publicSubject = sanitizePublicBriefText(brief.subject, brief.date) || 'Brief';
  const description = sanitizePublicBriefText(brief.ping, brief.date).slice(0, 220) || publicSubject;
  const path = `/briefs/${date}/${kind}`;
  return {
    title: publicSubject,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      title: publicSubject,
      description,
      url: path,
      publishedTime: brief.sentVerifiedAt.toISOString(),
    },
  };
}

export default async function BriefKindPage({
  params,
}: {
  params: Promise<{ date: string; kind: string }>;
}) {
  const { date, kind } = await params;
  if (!DATE_RE.test(date) || !isBriefKind(kind)) notFound();
  // Deliberately NOT safeQuery: if the DB is briefly down during background
  // revalidation, throwing keeps the previously rendered page serving
  // (ISR stale-on-error) instead of replacing it with a 404.
  const rows = await listBriefsForDate(getDb(), date);
  if (rows.length === 0) notFound();
  const brief = pickBriefForKind(rows, kind);
  if (!brief) permanentRedirect(`/briefs/${date}`);
  return (
    <main className="container">
      <BriefArticle brief={brief} />
    </main>
  );
}
