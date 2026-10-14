/**
 * The Sovereign Signal endorsement line: the small compass and
 * "A Sovereign Signal project". The compass is the brand's compass-small.svg
 * inlined, so its ink follows `color` and its paper and diamond follow the
 * --paper and --rust tokens in both themes. The text stays live for readers
 * and search; CSS sets it in capitals.
 */
export function Endorsement({ className }: { className?: string }) {
  return (
    <p className={className ? `endorsement ${className}` : 'endorsement'}>
      <svg className="endorsement-mark" viewBox="0 0 64 64" width="16" height="16" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor">
          <circle cx="32" cy="32" r="18.5" strokeWidth="2.2" />
          <circle cx="32" cy="32" r="29" strokeWidth="2.2" />
        </g>
        <path
          fill="currentColor"
          d="M32 32 26.97 26.97 31.51 0.91 32.49 0.91 37.03 26.97Z M32 32 37.03 26.97 63.09 31.51 63.09 32.49 37.03 37.03Z M32 32 37.03 37.03 32.49 63.09 31.51 63.09 26.97 37.03Z M32 32 26.97 37.03 0.91 32.49 0.91 31.51 26.97 26.97Z"
        />
        <path
          fill="var(--paper, #F3EFE6)"
          d="M32.5 6.78 36 26.87 32.5 30.37Z M57.22 32.5 37.13 36 33.63 32.5Z M31.5 57.22 28 37.13 31.5 33.63Z M6.78 31.5 26.87 28 30.37 31.5Z"
        />
        <path fill="var(--paper, #F3EFE6)" d="M32 25.5 L38.5 32 L32 38.5 L25.5 32Z" />
        <path fill="var(--rust, #B4482A)" d="M32 27.3 L36.7 32 L32 36.7 L27.3 32Z" />
      </svg>
      <span>A Sovereign Signal project</span>
    </p>
  );
}
