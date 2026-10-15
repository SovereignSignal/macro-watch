import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { containsRestricted, redactRestrictedHtml, redactRestrictedText } from '@/lib/audience';

const MACRO = 'Brent rose 2% on supply risk.';

it('keeps macro analysis and drops each smart-money sentence for the public', () => {
  const sentences = [
    'Wallets with strong records hold $787,842 across 35 accounts against a US invasion of Iran.',
    '37 high-scored wallets deployed $1.15 million behind no US invasion.',
    'Smart-money flow still leans No ... with 32 wallets and about $1.07M deployed.',
  ];
  for (const sentence of sentences) {
    expect(redactRestrictedText(`${MACRO} ${sentence}`, 'public')).toBe(MACRO);
  }
  expect(redactRestrictedText(sentences.join(' '), 'public')).toBe('');
});

it('keeps decimals intact and drops statistic fragments', () => {
  expect(redactRestrictedText('Brent settled 83.5¢ above $1.07M basis. Wallets deployed $2M.', 'public')).toBe(
    'Brent settled 83.5¢ above $1.07M basis.',
  );
  expect(redactRestrictedText('Odds 62% · $719K · 34 wallets · 24h +$8K', 'public')).toBe('Odds 62%');
});

it('returns text unchanged for member and private audiences', () => {
  const text = `${MACRO} 37 high-scored wallets deployed $1.15 million behind no US invasion.`;
  expect(redactRestrictedText(text, 'member')).toBe(text);
  expect(redactRestrictedText(text, 'private')).toBe(text);
  expect(containsRestricted('8 markets from 48 tracked-wallet signals')).toBe(true);
  expect(containsRestricted(MACRO)).toBe(false);
});

it('removes the Smart money table column for the public only', () => {
  const html =
    '<table><thead><tr><th>Market</th><th>Odds</th><th>Smart money</th></tr></thead>' +
    '<tbody><tr><td>Iran</td><td>40%</td><td>$719K · 34 wallets</td></tr></tbody></table>';
  const out = redactRestrictedHtml(html, 'public');
  expect(out).toContain('Iran');
  expect(out).toContain('40%');
  expect(out).toContain('Odds');
  expect(out).not.toContain('Smart money');
  expect(out).not.toContain('719K');
  expect(out).not.toContain('wallets');
  expect(redactRestrictedHtml(html, 'member')).toBe(html);
});

it('removes nested and unquoted private-class blocks by exact token', () => {
  const html =
    '<div class=email-derived><div><p>secret one</p></div></div>' +
    "<section class = 'x email-only'><section>secret two</section></section>" +
    '<div class="a smart-money"><div>secret three</div></div>' +
    '<p class="email-derived-x">tokenkept</p><p>kept</p>';
  const out = redactRestrictedHtml(html, 'public');
  expect(out).not.toContain('secret');
  expect(out).toContain('tokenkept');
  expect(out).toContain('<p>kept</p>');
});

it('drops restricted blocks entirely and keeps the rest', () => {
  const out = redactRestrictedHtml(`<p>${MACRO}</p><p>Whales bought 12 wallets worth of No.</p>`, 'public');
  expect(out).toBe(`<p>${MACRO}</p>`);
});

it('shared privacy markers match the producer copy', () => {
  const bytes = readFileSync(path.join(process.cwd(), 'src/lib/security/privacy-markers.json'));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'e87ed82b540734e49768882d0678d5066adf2be851c740107745c85118b76424',
  );
});
