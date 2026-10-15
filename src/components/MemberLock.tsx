/** Small lock glyph plus screen-reader text, shown beside members-only links. */
export function MemberLock() {
  return (
    <>
      <svg
        className="nav-lock"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="1.5" y="4.5" width="7" height="4.5" fill="currentColor" />
        <path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="sr-only">{' (members only)'}</span>
    </>
  );
}
