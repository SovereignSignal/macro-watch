import { formatDate } from '@/lib/format';
import { sanitizePublicBriefHtml, sanitizePublicBriefText } from '@/lib/security/public-brief-html';

/**
 * Renders a brief in full. Sanitize at the final render boundary as well as
 * ingest so legacy rows are protected before the database is backfilled.
 */
export function BriefArticle(props: {
  brief: { date: string; kind: string; subject: string; html: string };
}) {
  const { brief } = props;
  const publicHtml = sanitizePublicBriefHtml(brief.html);
  return (
    <article className="brief">
      <p className="brief-meta">
        <span className="date">{formatDate(brief.date)}</span>
        {brief.kind === 'weekend' ? <span className="badge badge-weekend">Weekend review</span> : null}
      </p>
      <h1>{sanitizePublicBriefText(brief.subject)}</h1>
      <div className="brief-body" dangerouslySetInnerHTML={{ __html: publicHtml }} />
    </article>
  );
}
