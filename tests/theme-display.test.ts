import { expect, it } from 'vitest';
import { canonicalThemeSlug, displayThemeName, isRetiredAlias, themeFamily } from '@/lib/theme-display';

it('humanizes slug-as-name themes', () => {
  expect(displayThemeName('long-end-funding-pressure', 'long-end-funding-pressure')).toBe(
    'Long-end funding pressure',
  );
  expect(displayThemeName('rate-path-repricing', 'Rate-path repricing')).toBe('Rate-path repricing');
  expect(displayThemeName('gold-miners-real-assets', 'Gold / Miners / Real Assets')).toBe(
    'Gold / Miners / Real Assets',
  );
});

it('maps the six duplicate theme clusters onto one canonical slug', () => {
  expect(canonicalThemeSlug('dollar-plumbing-vs-gold')).toBe('dollar-plumbing-versus-gold');
  expect(canonicalThemeSlug('official-currency-defense')).toBe('official-currency-defense-yen-funded-leverage');
  expect(canonicalThemeSlug('yen-funded-leverage')).toBe('official-currency-defense-yen-funded-leverage');
  expect(canonicalThemeSlug('official-currency-defense-of-the-treasury-market')).toBe(
    'official-currency-defense-yen-funded-leverage',
  );
  expect(canonicalThemeSlug('red-sea-export-chokepoint')).toBe('red-sea-bab-al-mandab-export-chokepoint');
  expect(canonicalThemeSlug('housing-residential')).toBe('housing-residential-construction');
  expect(canonicalThemeSlug('crowded-calm')).toBe('cross-asset-crowded-calm');
  expect(canonicalThemeSlug('gold-and-silver')).toBe('gold-miners-real-assets');
  expect(themeFamily('official-currency-defense-yen-funded-leverage')).toEqual([
    'official-currency-defense-yen-funded-leverage',
    'official-currency-defense',
    'yen-funded-leverage',
    'official-currency-defense-of-the-treasury-market',
  ]);
  expect(isRetiredAlias('housing-residential', 'active', new Set(['housing-residential']))).toBe(false);
});

it('hides retired aliases when the standing slug is present', () => {
  const present = new Set(['gold-miners-real-assets', 'gold-and-silver']);
  expect(isRetiredAlias('gold-and-silver', 'retired', present)).toBe(true);
  expect(isRetiredAlias('gold-and-silver', 'candidate', present)).toBe(true);
  expect(isRetiredAlias('gold-miners-real-assets', 'active', present)).toBe(false);
  expect(isRetiredAlias('gold-and-silver', 'retired', new Set(['gold-and-silver']))).toBe(false);
});
