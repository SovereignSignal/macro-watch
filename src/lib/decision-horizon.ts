export type DatedPending = {
  status: string;
  expiresAt: string | null;
};

export function decisionHorizon(
  claims: DatedPending[],
  today: string,
): { nextDecision: string | null; overdue: number } {
  const pending = claims.filter((claim) => claim.status === 'pending' && claim.expiresAt);
  const overdue = pending.filter((claim) => (claim.expiresAt as string) < today).length;
  const nextDecision =
    pending
      .map((claim) => claim.expiresAt as string)
      .filter((date) => date >= today)
      .sort()[0] ?? null;
  return { nextDecision, overdue };
}
