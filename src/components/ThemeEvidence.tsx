import { formatDate } from '@/lib/format';
import type { EvidenceAttentionStatus, ThemeCard } from '@/lib/queries/map';

const NOVELTY_LABEL = {
  updated: 'Summary basis updated',
  repeated: 'Summary basis repeated',
} as const;

const BALANCE_SUMMARY = {
  supporting: 'supports',
  challenging: 'challenges',
  mixed: 'mixed evidence',
  unchanged: 'unchanged evidence',
  emerging: 'emerging evidence',
} as const;

const BALANCE_LABEL = {
  supporting: 'Supporting',
  challenging: 'Challenging',
  mixed: 'Mixed',
  unchanged: 'Unchanged',
  emerging: 'Emerging',
} as const;

const CONFIDENCE_LABEL = {
  raised: 'Raised',
  lowered: 'Lowered',
  unchanged: 'Unchanged',
  candidate: 'Candidate',
  invalidated: 'Invalidated',
} as const;

const ATTENTION_LABEL: Record<EvidenceAttentionStatus, string> = {
  live: 'live',
  stale: 'stale',
  retire_review: 'retire review',
  unassessed: 'unassessed',
  date_error: 'date error',
  archived: 'archived',
};

export function ThemeEvidenceSummary({ card }: { card: ThemeCard }) {
  const lifecycle = card.evidenceLifecycle;
  if (!lifecycle) {
    return (
      <p className="evidence-summary evidence-summary-unassessed">
        No delivered evidence assessment yet.
      </p>
    );
  }
  const parts = [
    NOVELTY_LABEL[lifecycle.basis_novelty],
    BALANCE_SUMMARY[lifecycle.balance],
    `confidence ${lifecycle.confidence_change}`,
    ATTENTION_LABEL[card.attentionStatus],
  ];
  return (
    <p className={`evidence-summary evidence-summary-${card.attentionStatus}`}>
      {parts.join(' · ')}
    </p>
  );
}

function EvidenceNotice({ card }: { card: ThemeCard }) {
  if (card.attentionStatus === 'stale') {
    return (
      <p className="evidence-warning evidence-warning-stale">
        Summary basis is stale: it has not changed for {card.evidenceAgeDays} days.
      </p>
    );
  }
  if (card.attentionStatus === 'retire_review') {
    return (
      <p className="evidence-warning evidence-warning-retire">
        Retire review due: the summary basis has not changed for {card.evidenceAgeDays} days.{' '}
        Silence has not changed its lifecycle status.
      </p>
    );
  }
  if (card.attentionStatus === 'date_error') {
    return (
      <p className="evidence-warning evidence-warning-date">
        Date error: the delivered summary basis change date is in the future. Lifecycle status is unchanged.
      </p>
    );
  }
  if (card.attentionStatus === 'archived') {
    return <p className="evidence-archived">Archived theme. Freshness monitoring is paused.</p>;
  }
  return null;
}

export function ThemeEvidenceCheck({ card }: { card: ThemeCard }) {
  const lifecycle = card.evidenceLifecycle;
  return (
    <section className="evidence-check">
      <h2>Evidence check</h2>
      {!lifecycle ? (
        <p className="evidence-unassessed">No delivered evidence assessment yet.</p>
      ) : (
        <EvidenceNotice card={card} />
      )}
      {lifecycle || card.evidence || card.nextCheck ? (
        <dl className="evidence-facts">
          <dt>Latest evidence</dt>
          <dd>{card.evidence ?? 'Not provided in this assessment.'}</dd>
          {lifecycle ? (
            <>
              <dt>Evidence balance</dt>
              <dd>{BALANCE_LABEL[lifecycle.balance]}</dd>
              <dt>Basis lifecycle</dt>
              <dd>{NOVELTY_LABEL[lifecycle.basis_novelty]}</dd>
              <dt>Confidence movement</dt>
              <dd>{CONFIDENCE_LABEL[lifecycle.confidence_change]}</dd>
              <dt>Last basis change</dt>
              <dd>{formatDate(lifecycle.last_basis_change_date)}</dd>
              {lifecycle.repeat_count > 0 ? (
                <>
                  <dt>Repeat count</dt>
                  <dd>{lifecycle.repeat_count} consecutive repeated deliveries</dd>
                </>
              ) : null}
            </>
          ) : null}
          {card.lastSeen ? (
            <>
              <dt>Last reviewed</dt>
              <dd>{formatDate(card.lastSeen)}</dd>
            </>
          ) : null}
          <dt>Next check</dt>
          <dd>{card.nextCheck ?? 'No next check delivered.'}</dd>
        </dl>
      ) : null}
    </section>
  );
}

const HEALTH_ORDER: { status: EvidenceAttentionStatus; label: string }[] = [
  { status: 'live', label: 'Live' },
  { status: 'stale', label: 'Stale' },
  { status: 'retire_review', label: 'Retire review' },
  { status: 'unassessed', label: 'Unassessed' },
  { status: 'date_error', label: 'Date errors' },
  { status: 'archived', label: 'Archived' },
];

/** Map-level view of summary-basis freshness without changing theme status. */
export function ThemeEvidenceHealth({ cards }: { cards: ThemeCard[] }) {
  const counts = Object.fromEntries(
    HEALTH_ORDER.map(({ status }) => [
      status,
      cards.filter((card) => card.attentionStatus === status).length,
    ]),
  ) as Record<EvidenceAttentionStatus, number>;

  return (
    <section className="evidence-health" aria-labelledby="evidence-health-heading">
      <div>
        <h2 id="evidence-health-heading">Evidence health</h2>
        <p className="brief-meta">Summary-basis freshness across the map.</p>
      </div>
      <dl>
        {HEALTH_ORDER.map(({ status, label }) => (
          <div key={status} className={`evidence-health-${status}`}>
            <dt>{label}</dt>
            <dd>{counts[status]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
