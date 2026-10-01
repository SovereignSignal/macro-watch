import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

const { default: RootLayout } = await import('@/app/layout');

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
  for (const href of ['/briefs', '/map', '/research', '/track-record', '/accountability', '/catalysts', '/search', '/about']) {
    expect(markup).toContain(`href="${href}"`);
  }
});

it('marks the brief as the current page on /', () => {
  expect(markup).toContain('aria-current="page"');
  expect(markup).toContain('href="/"');
});

it('renders children', () => {
  expect(markup).toContain('page content');
});

it('keeps the Updated stamp in the header only', () => {
  const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
  expect(layout.match(/<MastheadUpdated \/>/g)).toHaveLength(1);
  expect(layout).not.toContain('FooterUpdated');
});
