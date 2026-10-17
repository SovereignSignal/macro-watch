/**
 * The Sovs Macro mark: the 🦂 scorpion emoji.
 *
 * Rendered as the emoji glyph rather than a custom drawing (the owner's call,
 * 2026-07-12: the hand-drawn scorpion read as a blob at small sizes). The
 * emoji is aria-hidden; the accessible name lives on the home link that wraps
 * it (see layout.tsx).
 */
export function Mark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{ fontSize: size, lineHeight: 1, display: 'inline-block' }}
    >
      🦂
    </span>
  );
}
