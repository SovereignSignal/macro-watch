import { formatDate } from '@/lib/format';
import { publicHttpsUrl, publicText } from '@/lib/public-copy';
import { mentionsBlockedPublisher } from '@/lib/security/blocked-publishers';
import { containsPrivate, isForeignCall, isPrivateItem, omitPrivateWatchItems } from '@/lib/security/private-sources';

export type ScoreboardTotals = {
  scored: number | null;
  hit: number | null;
  miss: number | null;
  voided: number | null;
  open: number | null;
  hitRate: number | null;
  brier: number | null;
};

export type ResolvedCall = {
  callId: string;
  title: string;
  madeAt: string | null;
  resolvedAt: string | null;
  status: string;
  note: string | null;
  url: string | null;
};

export type OpenCall = {
  callId: string;
  title: string;
  madeAt: string | null;
  horizon: string | null;
};

export type Scoreboard = {
  asOf: string | null;
  totals: ScoreboardTotals;
  recent: ResolvedCall[];
  open: OpenCall[];
  /** Qualitative calls with no fixed due date. Empty when the payload omits them. */
  openQualitative: OpenCall[];
};

export type KalshiMover = {
  ticker: string | null;
  title: string;
  url: string | null;
  probNow: number | null;
  probPrev: number | null;
  changePp: number | null;
  /** Present only when the publisher had a ~1h snapshot and the window is 24h. */
  change1hPp: number | null;
  volume24h: number | null;
  category: string | null;
};

export type KalshiMovers = {
  asOf: string | null;
  windowHours: number | null;
  stale: boolean;
  items: KalshiMover[];
};

export type PublishedWatch = {
  updatedAt: string | null;
  scoreboard: Scoreboard | null;
  kalshiMovers: KalshiMovers | null;
};

export const EMPTY_WATCH: PublishedWatch = {
  updatedAt: null,
  scoreboard: null,
  kalshiMovers: null,
};

const LIST_CAP = 50;

const STATUS_MAP: Record<string, string> = {
  hit: 'hit',
  miss: 'miss',
  void: 'void',
  open: 'open',
  pending: 'open',
  correct: 'hit',
  incorrect: 'miss',
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function num(value: unknown): number | null {
  if (typeof value === 'boolean' || value == null) return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

function count(value: unknown): number | null {
  const n = num(value);
  if (n == null || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

function text(value: unknown, max = 400): string | null {
  if (typeof value !== 'string') return null;
  const clean = publicText(value).replace(/\s+/g, ' ').trim();
  if (!clean || mentionsBlockedPublisher(clean)) return null;
  return clean.slice(0, max);
}

function link(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (mentionsBlockedPublisher(value)) return null;
  return publicHttpsUrl(value.trim());
}

export function parseUpdatedAt(value: unknown): string | null {
  if (typeof value !== 'string' || mentionsBlockedPublisher(value)) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export function formatHitRate(rate: number): string | null {
  if (!Number.isFinite(rate) || rate < 0) return null;
  const pct = rate <= 1 ? rate * 100 : rate;
  if (pct > 100) return null;
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

export function formatBrier(value: number): string | null {
  if (!Number.isFinite(value) || value < 0 || value > 2) return null;
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

export function formatProb(value: number): string | null {
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  const pct = value <= 1 ? value * 100 : value;
  return `${Math.round(pct)}%`;
}

export function formatChangePp(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  const abs = Math.abs(rounded);
  const body = Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(1);
  if (rounded > 0) return `+${body} pp`;
  if (rounded < 0) return `-${body} pp`;
  return '0 pp';
}

export function formatVolume(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function formatWindow(hours: number): string | null {
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) return null;
  const rounded = Math.round(hours * 10) / 10;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return rounded === 1 ? 'Past 1 hour' : `Past ${body} hours`;
}

export function formatWatchDate(value: string | null): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [, month, date] = day.split('-').map(Number);
    if (month >= 1 && month <= 12 && date >= 1 && date <= 31) return formatDate(day);
  }
  return text(value, 80);
}

/** Kalshi board stamp: "YYYY-MM-DD HH:MM UTC" when the payload has a clock. */
export function formatWatchAsOf(value: string | null): string | null {
  if (!value) return null;
  if (/T\d{2}:\d{2}/.test(value)) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) {
      const d = new Date(ms);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm} UTC`;
    }
  }
  const day = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return formatWatchDate(value);
}

export function statusKey(value: unknown): string {
  const raw = text(value, 32);
  if (!raw) return 'unknown';
  const key = raw.toLowerCase();
  return STATUS_MAP[key] ?? key;
}

export function statusLabel(status: string): string {
  if (status === 'hit') return 'Hit';
  if (status === 'miss') return 'Miss';
  if (status === 'void') return 'Void';
  if (status === 'open') return 'Open';
  if (status === 'unknown') return 'Unknown';
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

function parseTotals(value: unknown): ScoreboardTotals {
  const body = record(value);
  const hitRate = body ? num(body.hit_rate) : null;
  const brier = body ? num(body.brier) : null;
  return {
    scored: body ? count(body.scored) : null,
    hit: body ? count(body.hit) : null,
    miss: body ? count(body.miss) : null,
    voided: body ? count(body['void']) : null,
    open: body ? count(body.open) : null,
    hitRate: hitRate != null && formatHitRate(hitRate) ? hitRate : null,
    brier: brier != null && formatBrier(brier) ? brier : null,
  };
}

function parseOpenList(value: unknown): OpenCall[] {
  const open: OpenCall[] = [];
  if (!Array.isArray(value)) return open;
  for (const raw of value) {
    if (open.length >= LIST_CAP || containsPrivate(raw) || isForeignCall(raw)) continue;
    const row = record(raw);
    if (!row) continue;
    const title = text(row.title, 240);
    if (!title) continue;
    open.push({
      callId: text(row.call_id, 80) ?? title,
      title,
      madeAt: text(row.made_at, 40),
      horizon: text(row.horizon, 120),
    });
  }
  return open;
}

function parseScoreboard(value: unknown): Scoreboard | null {
  const body = record(value);
  if (!body || isPrivateItem(body)) return null;
  const recent: ResolvedCall[] = [];
  if (Array.isArray(body.recent)) {
    for (const raw of body.recent) {
      if (recent.length >= LIST_CAP || containsPrivate(raw) || isForeignCall(raw)) continue;
      const row = record(raw);
      if (!row) continue;
      const title = text(row.title, 240);
      if (!title) continue;
      recent.push({
        callId: text(row.call_id, 80) ?? title,
        title,
        madeAt: text(row.made_at, 40),
        resolvedAt: text(row.resolved_at, 40),
        status: statusKey(row.status),
        note: text(row.note, 500),
        url: link(row.url),
      });
    }
  }
  return {
    asOf: text(body.as_of, 40),
    totals: parseTotals(body.totals),
    recent,
    open: parseOpenList(body.open),
    openQualitative: parseOpenList(body.open_qualitative),
  };
}

const SETTLED_MOVER_STATUS = new Set(['closed', 'settled', 'finalized', 'determined']);

function moverAsOfMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Drop a mover that has already settled or whose quote is marked stale. */
function hideMover(row: Record<string, unknown>, asOfMs: number | null): boolean {
  if (row.stale === true || row.stale === 1 || row.stale === 'true') return true;
  const status = typeof row.status === 'string' ? row.status.trim().toLowerCase() : '';
  if (SETTLED_MOVER_STATUS.has(status)) return true;
  if (asOfMs == null || typeof row.close_time !== 'string' || !row.close_time.trim()) return false;
  const closeMs = Date.parse(row.close_time);
  if (Number.isNaN(closeMs)) return false;
  return closeMs < asOfMs;
}

function parseMovers(value: unknown): KalshiMovers | null {
  const body = record(value);
  if (!body || isPrivateItem(body)) return null;
  const asOfMs = moverAsOfMs(body.as_of);
  const items: KalshiMover[] = [];
  if (Array.isArray(body.items)) {
    for (const raw of body.items) {
      if (containsPrivate(raw)) continue;
      const row = record(raw);
      if (!row || hideMover(row, asOfMs)) continue;
      const title = text(row.title, 240);
      const ticker = text(row.ticker, 40);
      if (!title && !ticker) continue;
      items.push({
        ticker,
        title: title ?? ticker ?? '',
        url: link(row.url),
        probNow: num(row.prob_now),
        probPrev: num(row.prob_prev),
        changePp: num(row.change_pp),
        change1hPp: num(row.change_1h_pp),
        volume24h: (() => {
          const volume = num(row.volume_24h);
          return volume != null && volume >= 0 ? volume : null;
        })(),
        category: text(row.category, 80),
      });
    }
  }
  const windowHours = num(body.window_hours);
  const ranked = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const av = a.item.changePp == null ? -1 : Math.abs(a.item.changePp);
      const bv = b.item.changePp == null ? -1 : Math.abs(b.item.changePp);
      if (av !== bv) return bv - av;
      return a.index - b.index;
    })
    .slice(0, LIST_CAP)
    .map(({ item }) => item);
  return {
    asOf: text(body.as_of, 40),
    windowHours: windowHours != null && windowHours > 0 ? windowHours : null,
    stale: body.stale === true || body.stale === 1 || body.stale === 'true',
    items: ranked,
  };
}

/** Read the optional watch keys off one panel payload. Missing keys stay empty. */
export function parsePublishedWatch(payload: unknown): PublishedWatch {
  const clean = omitPrivateWatchItems(payload);
  const body = record(clean);
  if (!body) return EMPTY_WATCH;
  const scoreboard = Object.prototype.hasOwnProperty.call(body, 'scoreboard') && body.scoreboard != null
    ? parseScoreboard(body.scoreboard)
    : null;
  const kalshiMovers = Object.prototype.hasOwnProperty.call(body, 'kalshi_movers') && body.kalshi_movers != null
    ? parseMovers(body.kalshi_movers)
    : null;
  return {
    updatedAt: Object.prototype.hasOwnProperty.call(body, 'updated_at') ? parseUpdatedAt(body.updated_at) : null,
    scoreboard,
    kalshiMovers,
  };
}

export function watchKeysPresent(payload: unknown): boolean {
  const body = record(payload);
  if (!body) return false;
  return body.updated_at != null || body.scoreboard != null || body.kalshi_movers != null;
}
