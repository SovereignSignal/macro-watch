import {
  bandKeyOf,
  buildFieldLayout,
  eventCountLabel,
  type FieldBand,
  type FieldNode,
  type FieldLayout,
  type FieldThemeInput,
  formatPressure,
  PRESSURE_CLAMP,
  pressureReading,
} from '@/lib/field-map';
import { ConvictionScale } from './ConvictionScale';
import { EmptyState } from './EmptyState';

/** Rotated-square diamond path, the house conviction glyph. */
function diamond(cx: number, cy: number, r: number): string {
  return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
}

function nodeTitle(n: FieldNode): string {
  const parts = [`${n.name}: ${n.status}`, `conviction ${n.conviction ?? 'unrated'}`];
  if (!n.shelf) {
    parts.push(
      n.eventCount === 0
        ? 'no events in 30d'
        : `${eventCountLabel(n.eventCount)}, net ${formatPressure(n.pressure)}`,
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

function FieldLegend() {
  return (
    <div className="field-legend">
      <dl className="field-legend-axes">
        <div>
          <dt>Row</dt>
          <dd>Conviction. High at the top, low at the bottom.</dd>
        </div>
        <div>
          <dt>Left or right</dt>
          <dd>Events in the last 30 days. Lowered pulls left, raised pushes right.</dd>
        </div>
      </dl>
      <ul className="field-legend-marks">
        <li>
          <ConvictionScale conviction="high" /> high
        </li>
        <li>
          <ConvictionScale conviction="medium" /> medium
        </li>
        <li>
          <ConvictionScale conviction="low" /> low
        </li>
        <li>
          <ConvictionScale conviction="medium" hollow /> candidate
        </li>
        <li className="field-legend-glow">
          <span className="field-legend-halo" aria-hidden="true" />
          glow means recent events
        </li>
      </ul>
    </div>
  );
}

function PressureMeter({ pressure }: { pressure: number }) {
  const pct = ((pressure + PRESSURE_CLAMP) / (2 * PRESSURE_CLAMP)) * 100;
  return (
    <span className="field-meter" aria-hidden="true">
      <span className="field-meter-track" />
      <span className="field-meter-zero" />
      <span className="field-meter-dot" style={{ left: `${pct}%` }} />
    </span>
  );
}

function LaneRow({ n }: { n: FieldNode }) {
  const reading = n.shelf ? 'retired' : pressureReading(n.pressure);
  const events = n.shelf ? null : eventCountLabel(n.eventCount);
  return (
    <li>
      <a href={`/map/${n.slug}`} aria-label={nodeTitle(n)}>
        <ConvictionScale conviction={n.conviction} hollow={n.status === 'candidate'} />
        <span className="field-lane-name">{n.name}</span>
        <span className="field-lane-meta">
          {n.status === 'candidate' ? 'candidate · ' : ''}
          {reading}
          {events ? ` · ${events}` : ''}
        </span>
        {n.shelf ? <span className="field-meter field-meter-empty" /> : <PressureMeter pressure={n.pressure} />}
      </a>
    </li>
  );
}

function FieldLanes({ layout }: { layout: FieldLayout }) {
  const plotted = layout.nodes.filter((n) => !n.shelf);
  const retired = layout.nodes.filter((n) => n.shelf);
  return (
    <div className="field-lanes">
      <p className="field-lanes-lead">
        Right means raised by events in the last 30 days. Left means lowered.
      </p>
      <div className="field-lanes-axis" aria-hidden="true">
        <span>Lowered</span>
        <span>Raised</span>
      </div>
      {layout.bands.map((band: FieldBand) => {
        const members = plotted
          .filter((n) => bandKeyOf(n.conviction) === band.key)
          .sort((a, b) => b.pressure - a.pressure || a.name.localeCompare(b.name));
        if (members.length === 0) return null;
        return (
          <section key={band.key} className="field-lane">
            <h3>{band.label} conviction</h3>
            <ol>
              {members.map((n) => (
                <LaneRow key={n.slug} n={n} />
              ))}
            </ol>
          </section>
        );
      })}
      {retired.length > 0 ? (
        <section className="field-lane is-shelf">
          <h3>Retired</h3>
          <ol>
            {retired
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((n) => (
                <LaneRow key={n.slug} n={n} />
              ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The /map hero. A server-rendered map of every theme: conviction band (y) ×
 * 30-day directional pressure (x). Desktop keeps the field chart, with axes
 * and a key that stay outside the scroll. Narrow screens swap the chart for
 * a lane list that encodes the same placement. Every node links to its
 * dossier and carries a native tooltip.
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
  const plotTop = layout.bands[0].top;
  const lowBand = layout.bands[2];
  const plotBottom = lowBand.top + lowBand.height;
  const midY = (plotTop + plotBottom) / 2;
  return (
    <figure className="field">
      <FieldLegend />
      <FieldLanes layout={layout} />
      <div className="field-scroll">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          aria-label="Every theme placed by conviction band and 30-day directional pressure. High conviction at the top. Lowered events sit left of center, raised events sit right."
        >
          {layout.bands.map((b) => (
            <rect
              key={`${b.key}-fill`}
              x={0}
              y={b.top}
              width={layout.width}
              height={b.height}
              className={`field-band-fill field-band-fill-${b.key}`}
            />
          ))}
          <line
            x1={layout.zeroX}
            x2={layout.zeroX}
            y1={plotTop}
            y2={plotBottom}
            className="field-zero"
          />
          {layout.bands.map((b) => (
            <g key={b.key}>
              <line
                x1={0}
                x2={layout.width}
                y1={b.top + b.height}
                y2={b.top + b.height}
                className="chart-grid"
              />
              <text x={36} y={b.top + 18} className="field-band-label">
                {b.label}
              </text>
            </g>
          ))}
          <text
            className="field-axis-title"
            textAnchor="middle"
            transform={`rotate(-90 14 ${midY})`}
            x={14}
            y={midY}
          >
            Conviction
          </text>
          <text x={layout.width - 16} y={16} textAnchor="end" className="field-axis-title">
            Last 30 days
          </text>
          {layout.shelf ? (
            <text x={36} y={layout.shelf.top + 17} className="field-band-label">
              Retired
            </text>
          ) : null}
          <line
            x1={layout.xMin}
            x2={layout.xMax}
            y1={layout.axisTop + 4}
            y2={layout.axisTop + 4}
            className="field-axis-rule"
          />
          <line
            x1={layout.zeroX}
            x2={layout.zeroX}
            y1={layout.axisTop}
            y2={layout.axisTop + 8}
            className="field-tick"
          />
          <text x={layout.xMin} y={layout.axisTop + 22} textAnchor="start" className="field-axis-label">
            Lowered
          </text>
          <text x={layout.zeroX} y={layout.axisTop + 22} textAnchor="middle" className="field-axis-label">
            No net move
          </text>
          <text x={layout.xMax} y={layout.axisTop + 22} textAnchor="end" className="field-axis-label">
            Raised
          </text>
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
      <figcaption>Select a theme for its record.</figcaption>
    </figure>
  );
}
