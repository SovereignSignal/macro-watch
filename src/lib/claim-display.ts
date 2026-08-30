import type { ClaimRecord } from '@/lib/queries/accountability';
import { publicHttpsUrl, publicText } from '@/lib/public-copy';

export type ClaimSource = { label: string; href: string | null };

export const STATUS_COPY: Record<string, { label: string; description: string }> = {
  pending: {
    label: 'awaiting outcome',
    description: 'No final result yet.',
  },
  hit: {
    label: 'correct',
    description: 'The outcome matched the claim.',
  },
  miss: {
    label: 'incorrect',
    description: 'The outcome contradicted the claim.',
  },
  partial: {
    label: 'mixed result',
    description: 'The outcome matched only part of the claim.',
  },
  expired: {
    label: 'no verdict',
    description: 'The due date passed without a verified result.',
  },
  'judgment-required': {
    label: 'qualitative review',
    description: 'A map condition with no market that can settle it.',
  },
  void: {
    label: 'excluded',
    description: 'Canceled, duplicated, or superseded.',
  },
};

export const QUALITY_COPY: Record<string, { label: string; description: string }> = {
  data_anchored: {
    label: 'data anchored',
    description: 'The outcome is tied to observable public data.',
  },
  narrative_reactive: {
    label: 'narrative driven',
    description: 'The market is sensitive to headlines, interpretation, or political narrative.',
  },
  tail_risk_gauge: {
    label: 'tail-risk gauge',
    description: 'The market is most useful as a price on a low-frequency risk.',
  },
  unclassified: {
    label: 'not classified',
    description: 'The claim predates the evidence-type classifier or lacks enough metadata.',
  },
};

export function payloadRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}

export function payloadStr(payload: unknown, key: string): string {
  const value = payloadRecord(payload)[key];
  return typeof value === 'string' ? publicText(value) : '';
}

export function isQualitativeClaim(claim: ClaimRecord): boolean {
  const payload = payloadRecord(claim.payload);
  return (
    claim.status === 'judgment-required' ||
    payload.checkable === false ||
    payload.claim_kind === 'flip-condition'
  );
}

export function isScoreableClaim(claim: ClaimRecord): boolean {
  return !isQualitativeClaim(claim);
}

export function claimTrackLabel(claim: ClaimRecord): string {
  if (isQualitativeClaim(claim)) return 'qualitative map review';
  return claim.kind === 'smart_money' ? 'smart-money market' : 'map-derived market';
}

export function statusLabel(status: string): string {
  return STATUS_COPY[status]?.label ?? status.replaceAll('-', ' ');
}

export function qualityLabel(value: string): string {
  return QUALITY_COPY[value]?.label ?? value.replaceAll('_', ' ').replaceAll('-', ' ');
}

export function humanizeSlug(value: string): string {
  const words = value.replaceAll('-', ' ');
  return words.length > 0 ? words[0].toUpperCase() + words.slice(1) : value;
}

export function claimSource(claim: ClaimRecord): ClaimSource | null {
  const payload = payloadRecord(claim.payload);
  const explicitUrl = typeof payload.source_url === 'string' ? publicHttpsUrl(payload.source_url) : null;
  const explicitAnchor = typeof payload.data_anchor === 'string' ? payload.data_anchor : '';
  const detail = payloadRecord(payload.data_anchor_detail);
  const label =
    (typeof detail.label === 'string' && detail.label) ||
    explicitAnchor ||
    (typeof detail.slug === 'string' && detail.slug) ||
    '';
  const slug = typeof detail.slug === 'string' ? detail.slug : '';
  const source = typeof detail.source === 'string' ? detail.source : '';
  const href =
    explicitUrl ||
    (slug && source.toLowerCase() === 'polymarket'
      ? `https://polymarket.com/event/${encodeURIComponent(slug)}`
      : null);
  return label || href ? { label: publicText(label || 'Source'), href } : null;
}
