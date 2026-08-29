import { expect, it } from 'vitest';
import { sanitizePublicBriefHtml } from '@/lib/security/public-brief-html';

it('keeps owned sweep, daily-front, and convective-front chrome', () => {
  const clean = sanitizePublicBriefHtml(`
    <aside class="sweep-finding tracking"><p>Rates are the story this week.</p></aside>
    <h2>Today's Delta</h2>
    <p>The front end sold off.</p>
    <p class="daily-front">Daily Front: ignition on rate-path-repricing.</p>
    <section id="the-view-from-above" class="convective-front tracking">
      <h2>The View From Above</h2>
      <p class="front-line">Rate-path ignition, 6 days in.</p>
      <p class="front-quiet">Quiet cells omitted.</p>
      <table class="front-table"><thead><tr><th>Theme</th></tr></thead><tbody><tr><td>Rates</td></tr></tbody></table>
    </section>
  `);

  expect(clean).toContain('<aside class="sweep-finding">');
  expect(clean).toContain('Rates are the story this week.');
  expect(clean).toContain('<p class="daily-front">Daily Front: ignition on rate-path-repricing.</p>');
  expect(clean).toContain('id="the-view-from-above"');
  expect(clean).toContain('class="convective-front"');
  expect(clean).toContain('<p class="front-line">Rate-path ignition, 6 days in.</p>');
  expect(clean).toContain('<p class="front-quiet">Quiet cells omitted.</p>');
  expect(clean).toContain('<table class="data-table">');
  expect(clean).not.toContain('tracking');
  expect(clean).not.toContain('front-table');
});

it('unwraps an aside without an allowlisted class', () => {
  const clean = sanitizePublicBriefHtml('<aside>Bare note.</aside><p>Kept.</p>');
  expect(clean).not.toContain('<aside');
  expect(clean).toContain('Bare note.');
  expect(clean).toContain('<p>Kept.</p>');
});

it('drops a private-path aside instead of unwrapping the leak', () => {
  const clean = sanitizePublicBriefHtml(
    '<aside class="sweep-finding">Research at /home/ubuntu/openclaw-workspace/secret.md</aside><p>Public.</p>',
  );
  expect(clean).not.toContain('openclaw-workspace');
  expect(clean).toContain('<p>Public.</p>');
});
