import { expect, it } from 'vitest';
import { displayThemeName, isRetiredAlias } from '@/lib/theme-display';

it('humanizes slug-as-name themes', () => {
  expect(displayThemeName('long-end-funding-pressure', 'long-end-funding-pressure')).toBe(
    'Long-end funding pressure',
  );
  expect(displayThemeName('rate-path-repricing', 'Rate-path repricing')).toBe('Rate-path repricing');
  expect(displayThemeName('gold-miners-real-assets', 'Gold / Miners / Real Assets')).toBe(
    'Gold / Miners / Real Assets',
  );
});

it('hides retired aliases when the standing slug is present', () => {
  const present = new Set(['gold-miners-real-assets', 'gold-and-silver']);
  expect(isRetiredAlias('gold-and-silver', 'retired', present)).toBe(true);
  expect(isRetiredAlias('gold-miners-real-assets', 'active', present)).toBe(false);
  expect(isRetiredAlias('gold-and-silver', 'retired', new Set(['gold-and-silver']))).toBe(false);
});
