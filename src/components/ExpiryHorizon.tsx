import type { ClaimRecord } from '@/lib/queries/accountability';
import { EmptyState } from './EmptyState';

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type Slot = {
  label: string;
  year?: string;
  count: number;
  title: string;
  separated?: boolean;
};

// Geometry: 22px bars with 2px gaps off a shared baseline rule; the SVG
// keeps its natural width and scrolls inside .horizon-scroll on small
// screens instead of squeezing the bars.
const SLOT_W = 24;
const BAR_W = 22;
const PAD_X = 6;
const TOP_PAD = 18;
const PLOT_H = 92;
const LABEL_BAND = 30;
const SEP = 12;

function roundTopBar(x: number, yTop: number, h: number): string {
  const r = Math.min(3, h);
  const y0 = yTop + h; // baseline
  return `M${x} ${y0} V${yTop + r} Q${x} ${yTop} ${x + r} ${yTop} H${x + BAR_W - r} Q${x + BAR_W} ${yTop} ${x + BAR_W} ${yTop + r} V${y0} Z`;
}

// Only mechanically scoreable claims with a future outcome belong here.
const OPEN_STATUSES = new Set(['pending']);

/**
 * "The horizon" shows when the open book comes due: pending mechanical claims
 * bucketed by expiry month (next 12 months), plus a `12+`
 * bucket if anything reaches further and an `OPEN` bucket for claims with no
 * expiry. Already-overdue open claims count in the current month. Nothing
 * is memory-holed. Single amber-neutral hue (one series); every nonzero bar
 * carries a visible count and a native SVG tooltip.
 */
export function ExpiryHorizon({ claims, now = new Date() }: { claims: ClaimRecord[]; now?: Date }) {
  const openBook = claims.filter((c) => OPEN_STATUSES.has(c.status));
  if (openBook.length === 0) {
    return <EmptyState>No open claims on the horizon.</EmptyState>;
  }
  const idx0 = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const months = Array.from({ length: 12 }, () => 0);
  let later = 0;
  let open = 0;
  for (const c of openBook) {
    if (!c.expiresAt) {
      open += 1;
      continue;
    }
    const d = Number(c.expiresAt.slice(0, 4)) * 12 + (Number(c.expiresAt.slice(5, 7)) - 1) - idx0;
    if (d > 11) later += 1;
    else months[Math.max(d, 0)] += 1; // overdue open claims are due now
  }

  const slots: Slot[] = months.map((count, i) => {
    const m = (idx0 + i) % 12;
    const y = Math.floor((idx0 + i) / 12);
    return {
      label: MONTH_SHORT[m],
      year: i === 0 || m === 0 ? `’${String(y).slice(2)}` : undefined,
      count,
      title: `${MONTH_LONG[m]} ${y}: ${count} open claim${count === 1 ? '' : 's'}`,
    };
  });
  if (later > 0) {
    slots.push({
      label: '12+',
      count: later,
      title: `Beyond 12 months: ${later} open claim${later === 1 ? '' : 's'}`,
      separated: true,
    });
  }
  if (open > 0) {
    slots.push({
      label: 'OPEN',
      count: open,
      title: `No due date: ${open} open claim${open === 1 ? '' : 's'}`,
      separated: later === 0,
    });
  }

  const max = Math.max(...slots.map((s) => s.count));
  const sepCount = slots.filter((s) => s.separated).length;
  const width = PAD_X * 2 + slots.length * SLOT_W + sepCount * SEP;
  const height = TOP_PAD + PLOT_H + LABEL_BAND;
  const baseline = TOP_PAD + PLOT_H;

  let offset = 0;
  const positioned = slots.map((s) => {
    if (s.separated) offset += SEP;
    const x = PAD_X + offset;
    offset += SLOT_W;
    return { ...s, x };
  });

  return (
    <figure className="horizon">
      <div className="horizon-scroll">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Open claims by expiry month"
        >
          <line x1="0" x2={width} y1={baseline} y2={baseline} className="horizon-base" />
          {positioned.map((s) => {
            const h = s.count > 0 ? Math.max((s.count / max) * PLOT_H, 3) : 0;
            const cx = s.x + BAR_W / 2 + 1;
            return (
              <g key={s.label}>
                <title>{s.title}</title>
                {/* full-column hit target so the tooltip never needs pinpoint hover */}
                <rect x={s.x} y="0" width={SLOT_W} height={baseline} className="horizon-slot" />
                {s.count > 0 ? <path d={roundTopBar(s.x + 1, baseline - h, h)} className="horizon-bar" /> : null}
                {s.count > 0 ? (
                  <text x={cx} y={baseline - h - 5} textAnchor="middle" className="horizon-count">
                    {s.count}
                  </text>
                ) : null}
                <text x={cx} y={baseline + 13} textAnchor="middle" className="horizon-label">
                  {s.label}
                </text>
                {s.year ? (
                  <text x={cx} y={baseline + 24} textAnchor="middle" className="horizon-label horizon-year">
                    {s.year}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption>
        Pending eligible claims by decision month.
      </figcaption>
    </figure>
  );
}
