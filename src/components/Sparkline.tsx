/**
 * Micro step-trace of a conviction series (ordinal levels 1–3), the
 * instrument-panel counterpart of the dossier's full step chart. Index-scaled
 * (one step per snapshot), not time-scaled: it is a trend glyph, not an axis.
 */
export function Sparkline({
  levels,
  width = 88,
  height = 22,
  scale = 'ordinal',
  label = 'Conviction trend',
}: {
  levels: number[];
  width?: number;
  height?: number;
  /** Ordinal keeps the 1–3 conviction step trace. Linear scales to the series. */
  scale?: 'ordinal' | 'linear';
  label?: string;
}) {
  const points = levels.filter((value) => Number.isFinite(value)).slice(-120);
  if (points.length < 2) return null;
  const pad = 3;
  const x = (i: number): number => pad + (i / (points.length - 1)) * (width - 2 * pad);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const y = (value: number): number => {
    if (scale === 'linear') {
      if (max === min) return height / 2;
      return height - pad - ((value - min) / (max - min)) * (height - 2 * pad);
    }
    return height - pad - ((value - 1) / 2) * (height - 2 * pad);
  };
  let d = `M ${x(0).toFixed(1)} ${y(points[0]).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += scale === 'linear'
      ? ` L ${x(i).toFixed(1)} ${y(points[i]).toFixed(1)}`
      : ` H ${x(i).toFixed(1)} V ${y(points[i]).toFixed(1)}`;
  }
  const last = points.length - 1;
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
    >
      <path d={d} className="spark-line" />
      <circle cx={x(last)} cy={y(points[last])} r={2} className="spark-dot" />
    </svg>
  );
}
