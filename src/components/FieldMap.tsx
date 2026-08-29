import {
  buildFieldLayout,
  type FieldNode,
  type FieldThemeInput,
  formatPressure,
} from '@/lib/field-map';
import { cellPhaseLabel, parseCellPhase } from '@/lib/cell-phase';
import { EmptyState } from './EmptyState';

/** Rotated-square diamond path, the house conviction glyph. */
function diamond(cx: number, cy: number, r: number): string {
  return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
}

function nodeTitle(n: FieldNode): string {
  const parts = [
    `${n.name}: ${n.status}`,
    `conviction ${n.conviction ?? 'unrated'}`,
  ];
  const phase = cellPhaseLabel(parseCellPhase(n.cellPhase));
  if (phase) parts.push(`cell phase ${phase.toLowerCase()}`);
  if (!n.shelf) {
    parts.push(
      n.eventCount === 0
        ? 'no events in 30d'
        : `${n.eventCount} event${n.eventCount === 1 ? '' : 's'} in 30d, net ${formatPressure(n.pressure)}`,
    );
  }
  if (n.lastEventAt) parts.push(`last event ${n.lastEventAt}`);
  return parts.join(', ');
}

/** The ◆◆◇ gauge as a field marker: lit positions amber (hollow while a
 *  candidate), unlit positions faint, matching the cards below. */
function Cluster({ n }: { n: FieldNode }) {
  if (n.shelf) {
    return <path d={diamond(n.x, n.y, 4)} className="fn-off" />;
  }
  const r = 4.5;
  return (
    <>
      {[0, 1, 2].map((i) => {
        const cx = n.x + (i - 1) * 12;
        const litClass = n.status === 'candidate' ? 'fn-cand' : 'fn-lit';
        return <path key={i} d={diamond(cx, n.y, r)} className={i < n.lit ? litClass : 'fn-off'} />;
      })}
    </>
  );
}

/**
 * The /map hero. A server-rendered SVG map of every theme:
 * conviction band (y) × 30-day directional pressure (x), lifecycle in the
 * mark (filled active / hollow candidate / faint retired shelf), 30-day
 * event count as a soft halo. Every node links to its dossier and carries
 * a native tooltip. Scrolls horizontally in its container on small screens.
 */
export function FieldMap({ themes, asOf }: { themes: FieldThemeInput[]; asOf: string }) {
  if (themes.length === 0) return null;
  const layout = buildFieldLayout(themes, asOf);
  if (layout.plottable < 2) {
    return (
      <EmptyState>
        The position map appears once two themes are active.
      </EmptyState>
    );
  }
  const lowBand = layout.bands[2];
  const plotBottom = lowBand.top + lowBand.height;
  return (
    <figure className="field">
      <div className="field-scroll">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          aria-label="The field: every theme placed by conviction band and 30-day directional pressure"
        >
          {/* zero-pressure rule, behind everything */}
          <line x1={layout.zeroX} x2={layout.zeroX} y1={0} y2={plotBottom} className="chart-grid" />
          {/* band strata */}
          {layout.bands.map((b) => (
            <g key={b.key}>
              <line
                x1={0}
                x2={layout.width}
                y1={b.top + b.height}
                y2={b.top + b.height}
                className="chart-grid"
              />
              <text x={14} y={b.top + 17} className="field-band-label">
                {b.label}
              </text>
            </g>
          ))}
          {/* quadrant whispers: two annotations, no grid.
              "pressured" not "the front". Front is the email weather strip. */}
          <text x={layout.width - 16} y={layout.bands[0].top + 17} textAnchor="end" className="field-quad">
            pressured
          </text>
          <text x={layout.width - 16} y={lowBand.top + 17} textAnchor="end" className="field-quad">
            emerging
          </text>
          {/* the retired shelf */}
          {layout.shelf ? (
            <text x={14} y={layout.shelf.top + 17} className="field-band-label">
              RETIRED
            </text>
          ) : null}
          {/* pressure axis */}
          <text x={layout.zeroX} y={layout.axisTop + 21} textAnchor="middle" className="field-axis-label">
            ← easing · pressure · building →
          </text>
          {/* nodes: halo (weight) + gauge cluster + direct label, linked */}
          {layout.nodes.map((n) => (
            <a
              key={n.slug}
              href={`/map/${n.slug}`}
              aria-label={nodeTitle(n)}
              className={[
                'field-node',
                n.shelf ? 'is-shelf' : '',
                n.status === 'candidate' ? 'is-candidate' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <title>{nodeTitle(n)}</title>
              <rect
                x={n.x0 - 4}
                y={n.y - 9}
                width={n.x1 - n.x0 + 8}
                height={18}
                className="field-hit"
              />
              {!n.shelf && n.eventCount > 0 ? (
                <circle cx={n.x} cy={n.y} r={10 + 2 * Math.min(n.eventCount, 6)} className="fn-halo" />
              ) : null}
              <Cluster n={n} />
              <text x={n.labelX} y={n.y + 3.5} textAnchor={n.labelAnchor} className="fn-label">
                {n.label}
              </text>
            </a>
          ))}
        </svg>
      </div>
      <figcaption>
        Diamonds show conviction. Hollow marks candidates. Halos show recent activity. Cell phase
        is on the cards below. Select a theme for its record.
      </figcaption>
    </figure>
  );
}
