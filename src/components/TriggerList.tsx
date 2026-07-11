const GLYPH: Record<string, string> = {
  live: '●',
  watching: '◐',
  pending: '○',
};

const KNOWN_STATES = new Set([
  'live',
  'prior-close',
  'official-latest',
  'unverified',
  'pending',
  'watching',
]);

function slugify(state: string): string {
  return state.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

/** Freshness chip class for a state string; unknown states get the plain chip. */
export function chipClass(state: string): string {
  const slug = slugify(state);
  return KNOWN_STATES.has(slug) ? `chip chip-${slug}` : 'chip';
}

/** Trigger rows on an instrument card: state tick glyph, name, freshness chip. */
export function TriggerList({ triggers }: { triggers: { name: string; state: string }[] }) {
  if (triggers.length === 0) return null;
  return (
    <ul className="trigger-list">
      {triggers.map((t) => (
        <li key={t.name}>
          <span className={`tick tick-${slugify(t.state)}`} aria-hidden="true">
            {GLYPH[t.state.toLowerCase()] ?? '·'}
          </span>
          <span className="trigger-name">{t.name}</span>
          <span className={chipClass(t.state)}>{t.state}</span>
        </li>
      ))}
    </ul>
  );
}
