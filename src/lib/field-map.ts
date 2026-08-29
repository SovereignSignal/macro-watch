/**
 * Position math for the /map hero (spec §5 /map).
 *
 * A theme's place on the field is meaning, not decoration:
 *   y: conviction band (high / medium / low; unrated reads low),
 *   x: 30-day directional pressure, the sum of its recent theme-event
 *       directions (raise +1, lower −1, candidate +0.5, invalidate −0.5,
 *       hold 0, retire −1), clamped to [−3, +3].
 * Retired themes are not plotted; they pin to a thin shelf below the bands.
 *
 * Everything here is pure and deterministic: same inputs → same layout.
 * Within-band placement is a jitter keyed on a slug hash; a single top-down
 * sweep then nudges any nodes whose label footprints overlap apart, growing
 * the band when a column stacks deep. No Date.now, no randomness.
 */

export type FieldEvent = { direction: string; date: string };

export type FieldThemeInput = {
  slug: string;
  name: string;
  status: string; // active | candidate | retired
  conviction: 'low' | 'medium' | 'high' | null;
  lastEventAt: string | null;
  /** Optional satellite weather from theme-state. Display-only. */
  cellPhase?: string | null;
  /** Theme events; buildFieldLayout windows them to the 30 days ending asOf. */
  events: FieldEvent[];
};

export type FieldNode = {
  slug: string;
  name: string;
  /** Shortened display label (full name lives in the tooltip). */
  label: string;
  status: string;
  conviction: 'low' | 'medium' | 'high' | null;
  cellPhase: string | null;
  /** Lit positions on the diamond gauge (high 3 / medium 2 / low 1 / unrated 0). */
  lit: 0 | 1 | 2 | 3;
  /** Clamped 30-day pressure score. */
  pressure: number;
  /** Events inside the 30-day window. */
  eventCount: number;
  lastEventAt: string | null;
  x: number;
  y: number;
  labelX: number;
  labelAnchor: 'start' | 'end';
  /** Horizontal footprint (marker + label), for hit targets. */
  x0: number;
  x1: number;
  shelf: boolean;
};

export type FieldBand = {
  key: 'high' | 'medium' | 'low';
  label: string;
  top: number;
  height: number;
};

export type FieldLayout = {
  width: number;
  height: number;
  bands: FieldBand[];
  /** null when nothing is retired. */
  shelf: { top: number; height: number } | null;
  axisTop: number;
  xMin: number;
  xMax: number;
  zeroX: number;
  /** Themes that plot on the field (active + candidate). */
  plottable: number;
  nodes: FieldNode[];
};

// --- geometry (viewBox units) ----------------------------------------------

export const FIELD_W = 720;
const X_MIN = 84;
const X_MAX = 636;
const EDGE = 10; // labels never cross this inset
const BAND_H = 96; // default band height; grows when a column stacks deep
const EMPTY_BAND_H = 48; // an unoccupied stratum stays labeled but thin
const BAND_PAD_TOP = 28; // reserved strip for band label / annotations
const BAND_PAD_BOT = 16;
const V_GAP = 18; // min vertical gap between overlapping footprints
export const CLUSTER_HALF = 17; // half-width of the ◆◆◇ cluster
const CHAR_W = 6; // IBM Plex Mono advance at 10px
const LABEL_GAP = 7;
const LABEL_MAX = 28;
const SHELF_PAD_TOP = 24;
const SHELF_ROW_H = 20;
const SHELF_PAD_BOT = 14;
const SHELF_ITEM_GAP = 26;
const SHELF_X0 = 88; // items start clear of the RETIRED shelf label
const AXIS_H = 32;

export const PRESSURE_CLAMP = 3;

const DIRECTION_WEIGHT: Record<string, number> = {
  raise: 1,
  lower: -1,
  candidate: 0.5,
  invalidate: -0.5,
  hold: 0,
  retire: -1,
};

const LEVEL: Record<string, 0 | 1 | 2 | 3> = { low: 1, medium: 2, high: 3 };

const round1 = (v: number): number => Math.round(v * 10) / 10;

// --- pure pieces (unit-tested directly) --------------------------------------

/** Net directional pressure of a set of events, clamped to [−3, +3]. */
export function pressureScore(events: { direction: string }[]): number {
  let s = 0;
  for (const e of events) s += DIRECTION_WEIGHT[e.direction] ?? 0;
  return Math.max(-PRESSURE_CLAMP, Math.min(PRESSURE_CLAMP, s));
}

/** First date inside the `days`-long window ending at asOf (inclusive). */
export function windowStart(asOf: string, days = 30): string {
  const t = Date.UTC(
    Number(asOf.slice(0, 4)),
    Number(asOf.slice(5, 7)) - 1,
    Number(asOf.slice(8, 10)),
  );
  return new Date(t - (days - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** Deterministic 0..1 jitter keyed on the slug (djb2-xor hash). */
export function slugJitter(slug: string): number {
  let h = 5381;
  for (let i = 0; i < slug.length; i++) h = (Math.imul(h, 33) ^ slug.charCodeAt(i)) >>> 0;
  return (h % 997) / 997;
}

/** Pressure → x in viewBox units. */
export function xForPressure(p: number): number {
  return round1(X_MIN + ((p + PRESSURE_CLAMP) / (2 * PRESSURE_CLAMP)) * (X_MAX - X_MIN));
}

/**
 * Field labels stay short: candidacy is already encoded (hollow diamonds),
 * so the boilerplate prefix drops, and anything longer than 28 characters
 * truncates. The tooltip and the grid below carry the full name.
 */
export function fieldLabel(name: string): string {
  const bare = name.replace(/^new theme candidate\s*[\u2014\u2013-]\s*/i, '');
  if (bare.length <= LABEL_MAX) return bare;
  return `${bare.slice(0, LABEL_MAX - 1).trimEnd()}…`;
}

/** +2 / −1.5 / 0 for tooltips and captions. */
export function formatPressure(p: number): string {
  if (p === 0) return '0';
  return p > 0 ? `+${p}` : `${p}`;
}

// --- layout -------------------------------------------------------------------

type Placed = FieldNode & { jitterY: number };

function bandKeyOf(conviction: FieldThemeInput['conviction']): 'high' | 'medium' | 'low' {
  return conviction === 'high' ? 'high' : conviction === 'medium' ? 'medium' : 'low';
}

/**
 * Lay out the whole field for the given day. Nodes are processed in slug
 * order so the result is independent of input order.
 */
export function buildFieldLayout(themes: FieldThemeInput[], asOf: string): FieldLayout {
  const start = windowStart(asOf);
  const sorted = [...themes].sort((a, b) => a.slug.localeCompare(b.slug));

  const plotted: Placed[] = [];
  const retired: FieldThemeInput[] = [];
  for (const t of sorted) {
    if (t.status === 'retired') {
      retired.push(t);
      continue;
    }
    const recent = t.events.filter((e) => e.date >= start && e.date <= asOf);
    const pressure = pressureScore(recent);
    const x = xForPressure(pressure);
    const label = fieldLabel(t.name);
    const labelW = label.length * CHAR_W;
    const fitsRight = x + CLUSTER_HALF + LABEL_GAP + labelW <= FIELD_W - EDGE;
    const labelX = fitsRight ? x + CLUSTER_HALF + LABEL_GAP : x - CLUSTER_HALF - LABEL_GAP;
    plotted.push({
      slug: t.slug,
      name: t.name,
      label,
      status: t.status,
      conviction: t.conviction,
      cellPhase: t.cellPhase ?? null,
      lit: t.conviction ? LEVEL[t.conviction] : 0,
      pressure,
      eventCount: recent.length,
      lastEventAt: t.lastEventAt,
      x,
      y: 0, // assigned below
      labelX: round1(labelX),
      labelAnchor: fitsRight ? 'start' : 'end',
      x0: round1(fitsRight ? x - CLUSTER_HALF : labelX - labelW),
      x1: round1(fitsRight ? labelX + labelW : x + CLUSTER_HALF),
      shelf: false,
      jitterY: 0,
    });
  }

  // Bands stack top-down; each grows to fit its own collision sweep.
  const bands: FieldBand[] = [];
  const nodes: FieldNode[] = [];
  let cursor = 0;
  for (const key of ['high', 'medium', 'low'] as const) {
    const members = plotted.filter((n) => bandKeyOf(n.conviction) === key);
    const usable = BAND_H - BAND_PAD_TOP - BAND_PAD_BOT;
    for (const n of members) n.jitterY = BAND_PAD_TOP + slugJitter(n.slug) * usable;
    members.sort((a, b) => a.jitterY - b.jitterY || a.slug.localeCompare(b.slug));
    let maxY = 0;
    for (let i = 0; i < members.length; i++) {
      let y = members[i].jitterY;
      for (let j = 0; j < i; j++) {
        const overlap = members[j].x0 < members[i].x1 && members[i].x0 < members[j].x1;
        if (overlap) y = Math.max(y, members[j].y + V_GAP);
      }
      members[i].y = y;
      maxY = Math.max(maxY, y);
    }
    const height =
      members.length === 0 ? EMPTY_BAND_H : Math.max(BAND_H, Math.ceil(maxY + BAND_PAD_BOT));
    for (const n of members) {
      n.y = round1(cursor + n.y);
      const { jitterY: _drop, ...node } = n;
      nodes.push(node);
    }
    bands.push({ key, label: key.toUpperCase(), top: cursor, height });
    cursor += height;
  }

  // The retired shelf: pinned rows below the bands, reading order by name.
  let shelf: FieldLayout['shelf'] = null;
  if (retired.length > 0) {
    const shelfTop = cursor;
    retired.sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
    let x = SHELF_X0;
    let row = 0;
    for (const t of retired) {
      const label = fieldLabel(t.name);
      const w = 8 + LABEL_GAP + label.length * CHAR_W;
      if (x + w > FIELD_W - EDGE && x > SHELF_X0) {
        x = SHELF_X0;
        row += 1;
      }
      const cy = shelfTop + SHELF_PAD_TOP + row * SHELF_ROW_H;
      nodes.push({
        slug: t.slug,
        name: t.name,
        label,
        status: t.status,
        conviction: t.conviction,
        cellPhase: t.cellPhase ?? null,
        lit: t.conviction ? LEVEL[t.conviction] : 0,
        pressure: 0,
        eventCount: 0,
        lastEventAt: t.lastEventAt,
        x: round1(x + 4),
        y: cy,
        labelX: round1(x + 8 + LABEL_GAP),
        labelAnchor: 'start',
        x0: round1(x),
        x1: round1(x + w),
        shelf: true,
      });
      x += w + SHELF_ITEM_GAP;
    }
    const height = SHELF_PAD_TOP + row * SHELF_ROW_H + SHELF_PAD_BOT;
    shelf = { top: shelfTop, height };
    cursor += height;
  }

  return {
    width: FIELD_W,
    height: cursor + AXIS_H,
    bands,
    shelf,
    axisTop: cursor,
    xMin: X_MIN,
    xMax: X_MAX,
    zeroX: xForPressure(0),
    plottable: plotted.length,
    nodes,
  };
}
