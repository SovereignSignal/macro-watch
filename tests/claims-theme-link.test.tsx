import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ClaimsTable } from '@/components/ClaimsTable';
import type { ClaimRecord } from '@/lib/queries/accountability';

const row = {
  claimId: 'c-themes',
  kind: 'map',
  themes: ['macro-unmapped', 'long-end-funding-pressure', 'made-up-theme'],
  payload: { predicate: 'Funding stays tight' },
  status: 'pending',
  openedAt: '2026-09-01',
  expiresAt: null,
  resolvedAt: null,
  search: '',
} as ClaimRecord;

it('links known theme chips and leaves macro-unmapped as plain text', () => {
  const html = renderToStaticMarkup(
    <ClaimsTable
      page={{ rows: [row], total: 1, page: 1, pageSize: 25 }}
      filters={{}}
      themeOptions={['macro-unmapped', 'long-end-funding-pressure']}
      classOptions={[]}
      themeNames={{ 'long-end-funding-pressure': 'Long-end funding pressure' }}
    />,
  );
  const themes = html.slice(html.indexOf('data-label="Themes"'), html.indexOf('</td>', html.indexOf('data-label="Themes"')));
  expect(themes).toContain('Unmapped');
  expect(themes).not.toContain('href="/map/macro-unmapped"');
  expect(themes).not.toMatch(/<a[^>]*>Unmapped<\/a>/);
  expect(themes).toContain('href="/map/long-end-funding-pressure"');
  expect(themes).toContain('Long-end funding pressure');
  expect(themes).toContain('Made up theme');
  expect(themes).not.toContain('href="/map/made-up-theme"');
  expect(html).not.toContain('href="/map/macro-unmapped"');
});
