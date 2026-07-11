import { formatDate } from '@/lib/format';

/**
 * Renders a brief in full. The HTML is sanitized publisher-side before it
 * ever reaches ingest (spec §3) and ingest is bearer-token gated, so this is
 * trusted content by contract.
 */
export function BriefArticle(props: {
  brief: { date: string; kind: string; subject: string; html: string };
}) {
  const { brief } = props;
  return (
    <article className="brief">
      <p className="brief-meta">
        {formatDate(brief.date)}{' '}
        {brief.kind === 'weekend' ? <span className="badge badge-weekend">Weekend review</span> : null}
      </p>
      <h1>{brief.subject}</h1>
      <div className="brief-body" dangerouslySetInnerHTML={{ __html: brief.html }} />
    </article>
  );
}
