const THEME_NAMES: Record<string, string> = {
  'long-end-funding-pressure': 'Long-end funding pressure',
  'crowded-calm': 'Crowded calm',
  'cross-asset-crowded-calm': 'Cross-asset crowded calm',
  'grid-hardware-bottleneck': 'Grid hardware bottleneck',
  'housing-residential': 'Housing / residential',
  'housing-residential-construction': 'Housing / residential construction',
  'japan-repatriation': 'Japan repatriation',
  'official-currency-defense': 'Official currency defense',
  'official-currency-defense-yen-funded-leverage': 'Official currency defense / yen-funded leverage',
  'official-currency-defense-of-the-treasury-market': 'Official currency defense of the Treasury market',
  'yen-funded-leverage': 'Yen-funded leverage',
  'dollar-plumbing-vs-gold': 'Dollar plumbing vs gold',
  'dollar-plumbing-versus-gold': 'Dollar plumbing versus gold',
  'red-sea-export-chokepoint': 'Red Sea export chokepoint',
  'red-sea-bab-al-mandab-export-chokepoint': 'Red Sea / Bab al-Mandab export chokepoint',
  'gold-and-silver': 'Gold and silver',
  'gold-miners-real-assets': 'Gold / miners / real assets',
  'nuclear-fuel-bottleneck': 'Nuclear fuel bottleneck',
  'defense-industrial-cycle': 'Defense industrial cycle',
  'demographic-fiscal-drag': 'Demographic fiscal drag',
};

/**
 * Retired or duplicate slugs that should read as one theme. Six clusters:
 * dollar plumbing, official currency defense / yen-funded leverage,
 * Red Sea export, housing, crowded calm, and gold.
 * Rows stay in the database; the map hides the alias when the canonical
 * slug is present and the dossier folds the alias's events and claims in.
 */
const ALIAS_OF: Record<string, string> = {
  'dollar-plumbing-vs-gold': 'dollar-plumbing-versus-gold',
  'official-currency-defense': 'official-currency-defense-yen-funded-leverage',
  'yen-funded-leverage': 'official-currency-defense-yen-funded-leverage',
  'official-currency-defense-of-the-treasury-market': 'official-currency-defense-yen-funded-leverage',
  'red-sea-export-chokepoint': 'red-sea-bab-al-mandab-export-chokepoint',
  'housing-residential': 'housing-residential-construction',
  'crowded-calm': 'cross-asset-crowded-calm',
  'gold-and-silver': 'gold-miners-real-assets',
};

export function canonicalThemeSlug(slug: string): string {
  return ALIAS_OF[slug] ?? slug;
}

/** Canonical slug plus every alias that points at it. */
export function themeFamily(slug: string): string[] {
  const canonical = canonicalThemeSlug(slug);
  const aliases = Object.entries(ALIAS_OF)
    .filter(([, target]) => target === canonical)
    .map(([alias]) => alias);
  return [canonical, ...aliases];
}

export function visibleThemeCards<T extends { slug: string; status: string }>(cards: T[]): T[] {
  const present = new Set(cards.map((card) => card.slug));
  return cards.filter((card) => !isRetiredAlias(card.slug, card.status, present));
}

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isSlugLike(name: string, slug: string): boolean {
  const trimmed = name.trim();
  if (trimmed === slug) return true;
  return !trimmed.includes(' ') && trimmed === trimmed.toLowerCase() && trimmed.replaceAll('_', '-') === slug;
}

export function displayThemeName(slug: string, name: string): string {
  const trimmed = name.trim();
  if (trimmed && !isSlugLike(trimmed, slug)) return trimmed;
  if (THEME_NAMES[slug]) return THEME_NAMES[slug];
  return titleCaseSlug(slug);
}

export function isRetiredAlias(slug: string, _status: string, present: Set<string>): boolean {
  const canonical = ALIAS_OF[slug];
  return Boolean(canonical && present.has(canonical));
}
