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
  expect(stripped).toContain('<h2>1. Map</h2>');
  expect(stripped).toContain('<h2>2. What We Read</h2>');
  expect(stripped).not.toContain('>3.');
  expect(stripped).not.toContain('>6.');
  expect(stripped).not.toContain('Prediction Market Lens');
  expect(stripped).not.toContain('Market Snapshot');
  expect(stripped).not.toContain('No 97%');
  expect(stripped).not.toContain('SPY');
});

it('drops a market dashboard section and renumbers so the sequence has no gaps', () => {
  const html = [
    '<h2>1. The day</h2><p>Lead.</p>',
    '<h2>5. Map</h2><p>Gold lowered.</p>',
    '<h2>6. Market Dashboard</h2><table class="data-table"><tr><td>SPY</td></tr></table>',
    '<h2>7. What changed</h2><p>Kept.</p>',
  ].join('');
  const stripped = stripBriefDuplicatePanels(html);
  expect(stripped).toContain('Lead.');
  expect(stripped).toContain('Gold lowered.');
  expect(stripped).toContain('Kept.');
  expect(stripped).not.toContain('Market Dashboard');
  expect(stripped).not.toContain('SPY');
  expect(stripped).toContain('<h2>1. The day</h2>');
  expect(stripped).toContain('<h2>2. Map</h2>');
  expect(stripped).toContain('<h2>3. What changed</h2>');
  expect(stripped).not.toMatch(/<h2[^>]*>\s*[567]\./);
});
