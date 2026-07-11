import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import RootLayout from '@/app/layout';

const markup = renderToStaticMarkup(
  <RootLayout>
    <p>page content</p>
  </RootLayout>,
);

it('carries the Sovereign Signal byline', () => {
  expect(markup).toContain('SovsClaw — a Sovereign Signal system');
});

it('carries the not-investment-advice footer', () => {
  expect(markup).toContain('Not investment advice');
});

it('links every surface from the nav', () => {
  for (const href of ['/briefs', '/map', '/accountability', '/catalysts', '/search', '/about']) {
    expect(markup).toContain(`href="${href}"`);
  }
});

it('renders children', () => {
  expect(markup).toContain('page content');
});
