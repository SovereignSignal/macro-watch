import { expect, it } from 'vitest';
import { stripBriefDuplicatePanels } from '@/lib/home-brief';

it('drops prediction-lens and market-snapshot sections', () => {
  const html = [
    '<h2>3. Map</h2><p>Gold lowered.</p>',
    '<h2>5. Prediction Market Lens</h2><div class="prediction-lens"><p>No 97%</p></div>',
    '<h2>6. What We Read</h2><p>Kept.</p>',
    '<h2>7. Market Snapshot</h2><table class="data-table"><tr><td>SPY</td></tr></table>',
  ].join('');
  const stripped = stripBriefDuplicatePanels(html);
  expect(stripped).toContain('Gold lowered.');
  expect(stripped).toContain('What We Read');
  expect(stripped).toContain('Kept.');
  expect(stripped).not.toContain('Prediction Market Lens');
  expect(stripped).not.toContain('Market Snapshot');
  expect(stripped).not.toContain('No 97%');
  expect(stripped).not.toContain('SPY');
});
