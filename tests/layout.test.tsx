import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ member: false }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

// next/headers cookies() only works inside a request, so stub the session.
vi.mock('@/lib/member-session', () => ({
  isMember: async () => session.member,
}));

const { default: RootLayout } = await import('@/app/layout');

async function render(member: boolean): Promise<string> {
  session.member = member;
  const tree = await RootLayout({ children: <p>page content</p> });
  return renderToStaticMarkup(tree);
}

const markup = await render(false);

beforeEach(() => {
  session.member = false;
});

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

it('locks the members-only links for logged-out visitors, in the nav and the footer', () => {
  expect(markup).toContain('nav-lock');
  expect(markup).toContain('aria-hidden="true"');
  expect(markup).toContain(' (members only)');
  // Two nav links plus two footer links carry the glyph.
  expect(markup.match(/class="nav-lock"/g)).toHaveLength(4);
  expect(markup).not.toContain('Sign out');
  expect(markup).not.toContain('/api/member/logout');
});

it('shows no locks and a sign-out button for members', async () => {
  const member = await render(true);
  expect(member).not.toContain('nav-lock');
  expect(member).not.toContain('(members only)');
  expect(member).toContain('Sign out');
  expect(member).toContain('action="/api/member/logout"');
  expect(member).toContain('method="post"');
  expect(member).toContain('href="/track-record"');
  expect(member).toContain('href="/accountability"');
});

it('keeps the endorsement and theme toggle for everyone', async () => {
  for (const html of [markup, await render(true)]) {
    expect(html).toContain('A Sovereign Signal project');
    expect(html).not.toContain('Gmail');
  }
});

it('uses the scorpion, not the compass, in the endorsement line', () => {
  expect(markup).toContain('class="endorsement-mark"');
  expect(markup).toContain('🦂');
  expect(markup).not.toContain('viewBox="0 0 64 64"');
});
