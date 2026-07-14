/**
 * Micro step-trace of a conviction series (ordinal levels 1–3), the
 * instrument-panel counterpart of the dossier's full step chart. Index-scaled
 * (one step per snapshot), not time-scaled: it is a trend glyph, not an axis.
 */
export function Sparkline({
  levels,
  width = 88,
  height = 22,
}: {
  levels: number[];
  width?: number;
  height?: number;
}) {
  if (levels.length < 2) return null;
  const pad = 3;
  const x = (i: number): number => pad + (i / (levels.length - 1)) * (width - 2 * pad);
  const y = (lv: number): number => height - pad - ((lv - 1) / 2) * (height - 2 * pad);
  let d = `M ${x(0).toFixed(1)} ${y(levels[0]).toFixed(1)}`;
  for (let i = 1; i < levels.length; i++) {
    d += ` H ${x(i).toFixed(1)} V ${y(levels[i]).toFixed(1)}`;
  }
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Conviction trend"
    >
      <path d={d} className="spark-line" />
      <circle cx={x(levels.length - 1)} cy={y(levels[levels.length - 1])} r={2} className="spark-dot" />
    </svg>
  );
}
