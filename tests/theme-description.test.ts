import { expect, it } from 'vitest';
import { NEUTRAL_THEME_DESCRIPTION, themeDescriptionFor } from '@/lib/queries/map';

it('replaces auto-generated theme descriptions with a neutral fallback', () => {
  expect(themeDescriptionFor('japan-repatriation', 'Japan repatriation', 'Tracks japan repatriation.')).toBe(
    NEUTRAL_THEME_DESCRIPTION,
  );
  expect(themeDescriptionFor('japan-repatriation', 'japan-repatriation', 'Tracks Japan Repatriation')).toBe(
    NEUTRAL_THEME_DESCRIPTION,
  );
  expect(themeDescriptionFor('japan-repatriation', 'Japan repatriation', null)).toBe(NEUTRAL_THEME_DESCRIPTION);
  expect(themeDescriptionFor('rate-path-repricing', 'Rate-path repricing', 'Tracks rate-path-repricing.')).toBe(
    'Tracks how new data changes the expected path of policy rates.',
  );
  expect(
    themeDescriptionFor(
      'custom-theme',
      'Custom theme',
      'Tracks how a specific flow shows up in prices.',
    ),
  ).toBe('Tracks how a specific flow shows up in prices.');
  expect(themeDescriptionFor('clock-test', 'Clock test', 'Tracks the clock.')).toBe('Tracks the clock.');
});
