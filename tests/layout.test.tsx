import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import RootLayout from '@/app/layout';

const markup = renderToStaticMarkup(
  <RootLayout>
    <p>page content</p>
  </RootLayout>,
);

it('brands the product as Sovs Macro and the relationship as a Sovereign Signal project', () => {
  expect(markup).toContain('Sovs Macro');
  expect(markup).toContain('A Sovereign Signal project');
  expect(markup).not.toContain('macro.watch');
  expect(markup).not.toContain('SovsClaw');
});

it('carries the not-investment-advice footer', () => {
  expect(markup).toContain('Research only. No buy or sell recommendations.');
});

it('describes public checks without claiming universal data verification', () => {
  expect(markup).toContain('Brief HTML is sanitized before publication');
  expect(markup).toContain('verified panels disclose source coverage');
  expect(markup).not.toContain('Data and structure checked');
});

it('links every surface from the nav', () => {
  for (const href of ['/briefs', '/map', '/research', '/accountability', '/catalysts', '/search', '/about']) {
    expect(markup).toContain(`href="${href}"`);
  }
});

it('renders children', () => {
  expect(markup).toContain('page content');
});
