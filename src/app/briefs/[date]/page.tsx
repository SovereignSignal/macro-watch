import { notFound } from 'next/navigation';
import { BriefArticle } from '@/components/BriefArticle';
import { getDb } from '@/db/client';
import { getBriefByDate } from '@/lib/queries/briefs';

export const revalidate = 900;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!DATE_RE.test(date)) return { title: 'Brief' };
  const brief = await getBriefByDate(getDb(), date);
  return { title: brief ? brief.subject : 'Brief' };
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
