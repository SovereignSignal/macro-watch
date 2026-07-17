import { formatDate, formatDateWithWeekday } from '@/lib/format';
import { sanitizePublicBriefHtml, sanitizePublicBriefText } from '@/lib/security/public-brief-html';

function stripRepeatedPublicationDate(html: string, date: string): string {
  const trimmed = html.trimStart();
  const labels = [formatDateWithWeekday(date), formatDate(date)];
  for (const label of labels) {
    const exactPrefixes = [`<p>${label}</p>`, `<div>${label}</div>`];
    const prefix = exactPrefixes.find((candidate) => trimmed.startsWith(candidate));
    if (prefix) return trimmed.slice(prefix.length).trimStart();
    if (trimmed === label || trimmed.startsWith(`${label}<`)) {
      return trimmed.slice(label.length).trimStart();
    }
  }
  return trimmed;
}

/**
 * Renders a brief in full. Sanitize at the final render boundary as well as
 * ingest so legacy rows are protected before the database is backfilled.
 */
export function BriefArticle(props: {
  brief: { date: string; kind: string; subject: string; html: string };
  showHeader?: boolean;
}) {
  const { brief } = props;
  const publicHtml = stripRepeatedPublicationDate(sanitizePublicBriefHtml(brief.html), brief.date);
  const showHeader = props.showHeader ?? true;
  return (
    <article className="brief">
      {showHeader ? (
        <>
          <p className="brief-meta">
            <span className="date">{formatDate(brief.date)}</span>
            {brief.kind === 'weekend' ? <span className="badge badge-weekend">Weekend review</span> : null}
          </p>
          <h1>{sanitizePublicBriefText(brief.subject)}</h1>
        </>
      ) : null}
      <div className="brief-body" dangerouslySetInnerHTML={{ __html: publicHtml }} />
    </article>
  );
}
