import { briefKindBadge } from '@/lib/brief-kind';
import { formatDate } from '@/lib/format';
import { stripBriefDuplicatePanels } from '@/lib/home-brief';
import { sanitizePublicBriefHtml, sanitizePublicBriefText } from '@/lib/security/public-brief-html';

/**
 * Renders a brief in full. Sanitize at the final render boundary as well as
 * ingest so legacy rows are protected before the database is backfilled.
 */
export function BriefKindChip({ kind, subject }: { kind: string; subject: string }) {
  const badge = briefKindBadge(kind, subject);
  if (!badge) return null;
  return <span className={badge.className}>{badge.label}</span>;
}

export function BriefArticle(props: {
  brief: { date: string; kind: string; subject: string; html: string };
  stripDuplicatePanels?: boolean;
}) {
  const { brief } = props;
  const publicHtml = sanitizePublicBriefHtml(brief.html);
  const html = props.stripDuplicatePanels ? stripBriefDuplicatePanels(publicHtml) : publicHtml;
  return (
    <article className="brief">
      <p className="brief-meta">
        <span className="date">{formatDate(brief.date)}</span>
        <BriefKindChip kind={brief.kind} subject={brief.subject} />
      </p>
      <h1>{sanitizePublicBriefText(brief.subject)}</h1>
      <div className="brief-body" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
