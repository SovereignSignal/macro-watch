import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import RootLayout from '@/app/layout';

const markup = renderToStaticMarkup(
  <RootLayout>
    <p>page content</p>
  </RootLayout>,
);

it('carries the Sovereign Signal byline', () => {
  expect(markup).toContain('SovsClaw by Sovereign Signal');
});

it('carries the not-investment-advice footer', () => {
  expect(markup).toContain('Research only. No buy or sell recommendations.');
});

it('describes public checks without claiming universal data verification', () => {
  expect(markup).toContain('Public output is sanitized');
  expect(markup).toContain('verified panels disclose source coverage');
  expect(markup).not.toContain('Data and structure checked');
});

it('links every surface from the nav', () => {
  for (const href of ['/briefs', '/map', '/accountability', '/catalysts', '/search', '/about']) {
    expect(markup).toContain(`href="${href}"`);
  }
});

it('renders children', () => {
  expect(markup).toContain('page content');
});
