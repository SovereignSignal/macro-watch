import type { ConvictionPoint } from '@/lib/queries/map';
import { EmptyState } from './EmptyState';

const LABELS = ['low', 'med', 'high'];

/**
 * Conviction-over-time as a hand-set step chart (spec §8: house charts, no
 * app-dashboard aesthetics — plain SVG, three ordinal levels).
 */
export function ConvictionChart({ points }: { points: ConvictionPoint[] }) {
  if (points.length < 2) {
    return <EmptyState>Not enough history to chart conviction yet — it appears once two snapshots exist.</EmptyState>;
  }
  const w = 560;
  const h = 120;
  const pad = 28;
  const t0 = new Date(points[0].takenAt).getTime();
  const t1 = new Date(points[points.length - 1].takenAt).getTime();
  const x = (iso: string): number =>
    t1 === t0 ? pad : pad + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (w - 2 * pad);
  const y = (level: number): number => h - pad - ((level - 1) / 2) * (h - 2 * pad);

  let d = `M ${x(points[0].takenAt).toFixed(1)} ${y(points[0].level).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H ${x(points[i].takenAt).toFixed(1)} V ${y(points[i].level).toFixed(1)}`;
  }

  return (
    <figure className="conviction-chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Conviction over time">
        {[1, 2, 3].map((level) => (
          <g key={level}>
            <line x1={pad} x2={w - pad} y1={y(level)} y2={y(level)} className="chart-grid" />
            <text x={2} y={y(level) + 3} className="chart-label">
              {LABELS[level - 1]}
            </text>
          </g>
        ))}
        <path d={d} className="chart-line" />
      </svg>
      <figcaption>Conviction over time, from theme-state snapshots.</figcaption>
    </figure>
  );
}
