/**
 * The status glyph vocabulary (pipeline statuses, spec §5). Status is always
 * conveyed by glyph and color together, never color alone, so every mark
 * stays legible under CVD, in print, and in forced-colors. Drawn as SVG
 * shapes (not text glyphs) so the marks render identically everywhere:
 *
 *   pending ○ · hit ◆ · miss ✕ · partial line · judgment ? · void ∅
 */

export const STATUS_ORDER = [
  'pending',
  'hit',
  'miss',
  'partial',
  'expired',
  'judgment-required',
  'void',
] as const;

export type ClaimStatus = (typeof STATUS_ORDER)[number];

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: 'awaiting outcome',
  hit: 'correct',
  miss: 'incorrect',
  partial: 'mixed result',
  expired: 'no verdict',
  'judgment-required': 'qualitative review',
  void: 'excluded',
};

function shape(status: string): React.ReactNode {
  switch (status) {
    case 'pending': // ○ still open, nothing to grade
      return <circle cx="8" cy="8" r="4.6" className="mk-pending" />;
    case 'hit': // ◆ the house diamond, up/green
      return <path d="M8 2.2 13.8 8 8 13.8 2.2 8Z" className="mk-hit" />;
    case 'miss': // ✕ down/red
      return <path d="M4.5 4.5 11.5 11.5 M11.5 4.5 4.5 11.5" className="mk-miss" />;
    case 'partial': // ◐ half right, amber
      return (
        <>
          <path d="M8 3.4 A4.6 4.6 0 0 0 8 12.6 Z" className="mk-partial-fill" />
          <circle cx="8" cy="8" r="4.6" className="mk-partial-ring" />
        </>
      );
    case 'expired': // horizontal line, window closed unresolved, faint
      return <path d="M4.2 8 H11.8" className="mk-expired" />;
    case 'judgment-required': // ? awaiting adjudication, muted
      return (
        <text x="8" y="12" textAnchor="middle" className="mk-judgment">
          ?
        </text>
      );
    case 'void': // ∅ struck from the book, faint
      return (
        <>
          <circle cx="8" cy="8" r="4.2" className="mk-void" />
          <path d="M4.9 12.2 11.1 3.8" className="mk-void" />
        </>
      );
    default: // unknown pipeline status: a faint open circle, never invented meaning
      return <circle cx="8" cy="8" r="4.2" className="mk-void" />;
  }
}

function symbolId(status: string): string {
  return (STATUS_ORDER as readonly string[]).includes(status) ? `mk-${status}` : 'mk-unknown';
}

/**
 * The shape library, drawn once per page. A grid of hundreds of marks (the
 * claim book) then references these with `<use>` instead of repeating every
 * path, which is what halved the accountability page (2026-09-05). Styling
 * still comes from the classes on the shapes: a `<use>` instance inherits
 * them. Render it once, before the first `symbol` mark.
 */
export function StatusMarkDefs() {
  return (
    <svg width="0" height="0" className="status-mark-defs" aria-hidden="true" focusable="false">
      <defs>
        {STATUS_ORDER.map((s) => (
          <symbol key={s} id={`mk-${s}`} viewBox="0 0 16 16">
            {shape(s)}
          </symbol>
        ))}
        <symbol id="mk-unknown" viewBox="0 0 16 16">
          {shape('unknown')}
        </symbol>
      </defs>
    </svg>
  );
}

/**
 * One status mark. With `title`, the SVG carries its own native tooltip
 * (the RSC-friendly hover layer, with no client JS). With `decorative`, the
 * mark is hidden from AT because a text label sits right beside it. With
 * `symbol`, the mark references the shape from `StatusMarkDefs` instead of
 * inlining it (use inside large grids).
 */
export function StatusMark({
  status,
  size = 16,
  title,
  decorative = false,
  symbol = false,
}: {
  status: string;
  size?: number;
  title?: string;
  decorative?: boolean;
  symbol?: boolean;
}) {
  // With a <title> the SVG already has its accessible name; repeating it as
  // aria-label doubled the text of every cell in the claim book. Symbol cells
  // also take their size from CSS (.status-mark-ref) instead of attributes.
  return (
    <svg
      viewBox="0 0 16 16"
      width={symbol ? undefined : size}
      height={symbol ? undefined : size}
      className={symbol ? 'status-mark status-mark-ref' : 'status-mark'}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative || title ? undefined : status}
    >
      {title ? <title>{title}</title> : null}
      {symbol ? <use href={`#${symbolId(status)}`} /> : shape(status)}
    </svg>
  );
}
