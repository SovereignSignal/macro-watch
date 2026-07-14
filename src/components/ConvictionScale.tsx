const LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3 };

/**
 * The house conviction gauge: three diamonds, lit to the conviction level
 * (high ◆◆◆, medium ◆◆◇, low ◆◇◇). Candidate themes render their lit
 * positions hollow. Null conviction reads all-off.
 */
export function ConvictionScale({
  conviction,
  hollow = false,
}: {
  conviction: 'low' | 'medium' | 'high' | null;
  hollow?: boolean;
}) {
  const n = conviction ? (LEVEL[conviction] ?? 0) : 0;
  return (
    <span
      className="conv-scale"
      role="img"
      aria-label={conviction ? `conviction ${conviction}` : 'conviction unrated'}
    >
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? 'd-lit' : 'd-off'} aria-hidden="true">
          {i <= n && !hollow ? '◆' : '◇'}
        </span>
      ))}
    </span>
  );
}
