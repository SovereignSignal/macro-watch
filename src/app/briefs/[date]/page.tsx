import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BriefArticle, BriefKindChip } from '@/components/BriefArticle';
import { getDb } from '@/db/client';
import { audienceFor, redactRestrictedText } from '@/lib/audience';
import { briefPath } from '@/lib/brief-kind';
import { isMember } from '@/lib/member-session';
import { listBriefsForDate } from '@/lib/queries/briefs';
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
  const rows = await listBriefsForDate(getDb(), date);
  if (rows.length === 0) return { title: 'Brief' };
  if (rows.length > 1) {
    const description = `Briefs published for ${date}.`;
    return {
      title: `Briefs for ${date}`,
      description,
      alternates: { canonical: `/briefs/${date}` },
      openGraph: {
        type: 'website',
        title: `Briefs for ${date}`,
        description,
        url: `/briefs/${date}`,
      },
    };
  }
  const brief = rows[0];
  const publicSubject =
    redactRestrictedText(sanitizePublicBriefText(brief.subject, brief.date), 'public') || 'Brief';
  const description =
    redactRestrictedText(sanitizePublicBriefText(brief.ping, brief.date), 'public').slice(0, 220) ||
    publicSubject;
  return {
    title: publicSubject,
    description,
    alternates: { canonical: `/briefs/${date}` },
    openGraph: {
      type: 'article',
      title: publicSubject,
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
  const rows = await listBriefsForDate(getDb(), date);
  if (rows.length === 0) notFound();
  const member = await isMember();
  const audience = audienceFor(member);
  if (rows.length === 1) {
    return (
      <main className="container">
        <BriefArticle brief={rows[0]} member={member} />
      </main>
    );
  }
  return (
    <main className="container">
      <h1>Briefs for {date}</h1>
      <p className="brief-meta">This date has more than one brief. Choose a kind.</p>
      <ul className="archive-list">
        {rows.map((brief) => (
          <li key={brief.kind}>
            <BriefKindChip kind={brief.kind} subject={brief.subject} />
            <div>
              <Link href={briefPath(brief.date, brief.kind, brief.subject)}>
                {redactRestrictedText(sanitizePublicBriefText(brief.subject, brief.date), audience) ||
                  'Brief'}
              </Link>
            </div>
            <p className="excerpt">
              {redactRestrictedText(sanitizePublicBriefText(brief.ping, brief.date), audience)}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
