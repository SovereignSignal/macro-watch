/**
 * The macro.watch scorpion — the SovsClaw signature, as a brand mark.
 *
 * Side-view heraldic: forward pincers, a segmented body, and the hero raised
 * tail curling forward over the back. The tail segments are the ◆ of the
 * conviction gauge; the single lit diamond at the tip is the amber stinger —
 * the one place color is spent. The body is a single ink color via
 * `currentColor`, so it inherits and flips light/dark; the stinger uses the
 * house --accent token, so it is right in both themes.
 *
 * Server component, no client JS. The whole mark is aria-hidden — its
 * accessible name lives on the home link that wraps it (see layout.tsx).
 */

// Shared stroke style for the line-drawn parts (legs, claws, tail spine).
const stroke = (w: number) =>
  ({
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: w,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }) as const;

export function Mark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(-0.856 -5.001) scale(1.2281)">
        {/* walking legs */}
        <path d="M12.00 23.90L10.40 26.50" {...stroke(1.05)} />
        <path d="M14.30 24.30L13.60 27.00" {...stroke(1.05)} />
        <path d="M16.40 24.00L17.00 26.60" {...stroke(1.05)} />
        {/* pincers */}
        <path d="M3.00 17.00L5.60 18.40L4.20 20.90M10.20 20.80L5.60 18.40" {...stroke(2.0)} />
        <path d="M3.40 24.20L6.20 24.60L5.00 27.20M10.60 23.00L6.20 24.60" {...stroke(2.0)} />
        {/* body segments */}
        <path d="M11.40 18.70L14.10 21.60L11.40 24.50L8.70 21.60Z" fill="currentColor" />
        <path d="M15.20 19.30L17.80 22.00L15.20 24.70L12.60 22.00Z" fill="currentColor" />
        <path d="M18.60 18.90L20.90 21.40L18.60 23.90L16.30 21.40Z" fill="currentColor" />
        {/* tail spine, then the diamond segments riding on it */}
        <path
          d="M18.60 21.40L20.40 19.80L22.10 16.80L21.70 13.20L19.60 10.40L16.40 8.90L13.20 9.80"
          {...stroke(2.3)}
        />
        <path d="M20.40 17.45L22.75 19.80L20.40 22.15L18.05 19.80Z" fill="currentColor" />
        <path d="M22.10 14.60L24.30 16.80L22.10 19.00L19.90 16.80Z" fill="currentColor" />
        <path d="M21.70 11.15L23.75 13.20L21.70 15.25L19.65 13.20Z" fill="currentColor" />
        <path d="M19.60 8.50L21.50 10.40L19.60 12.30L17.70 10.40Z" fill="currentColor" />
        <path d="M16.40 7.15L18.15 8.90L16.40 10.65L14.65 8.90Z" fill="currentColor" />
        {/* the stinger — the one lit-amber diamond */}
        <path d="M13.20 7.20L15.80 9.80L13.20 12.40L10.60 9.80Z" fill="var(--accent)" />
      </g>
    </svg>
  );
}
