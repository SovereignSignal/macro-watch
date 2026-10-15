import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));
vi.mock('@/lib/member-session', () => ({ isMember: async () => false }));

const { THEME_INIT_SCRIPT, ThemeToggle } = await import('@/components/ThemeToggle');
const { default: RootLayout, viewport } = await import('@/app/layout');

const layoutMarkup = renderToStaticMarkup(await RootLayout({ children: <p>page content</p> }));

describe('theme toggle', () => {
  it('renders an accessible button that is hidden until the client knows the theme', () => {
    const markup = renderToStaticMarkup(<ThemeToggle />);
    expect(markup).toContain('<button type="button" class="theme-toggle"');
    expect(markup).toContain('aria-label="Switch to dark mode"');
    expect(markup).not.toContain('data-ready');
    expect(markup).toContain('Dark<span class="theme-toggle-word"> mode</span>');
  });

  it('sits in the masthead with the pre-paint script in the head', () => {
    expect(layoutMarkup).toContain('class="theme-toggle"');
    expect(layoutMarkup).toContain(`<script>${THEME_INIT_SCRIPT}</script>`);
    expect(layoutMarkup).toContain('<html lang="en">');
  });

  it('uses the shared attribute and storage key from the reference site', () => {
    expect(THEME_INIT_SCRIPT).toContain('localStorage.getItem("theme")');
    expect(THEME_INIT_SCRIPT).toContain('document.documentElement.dataset.theme=t');
    expect(THEME_INIT_SCRIPT).toContain('meta[name="theme-color"]');
    expect(THEME_INIT_SCRIPT).not.toMatch(new RegExp(String.fromCharCode(0x2013) + '|' + String.fromCharCode(0x2014)));
  });

  it('declares both papers as theme colours', () => {
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: '#F3EFE6' },
      { media: '(prefers-color-scheme: dark)', color: '#141418' },
    ]);
  });

  it('keys the site colours like the brand tokens: system dark unless pinned light, and pinned dark', () => {
    const css = fs.readFileSync('src/app/globals.css', 'utf8');
    const systemDark = css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme=light\]\) \{([^}]*)\}/);
    const pinnedDark = css.match(/\n\[data-theme=dark\] \{([^}]*)\}/);
    expect(systemDark, 'system dark block').toBeTruthy();
    expect(pinnedDark, 'pinned dark block').toBeTruthy();
    const declarations = (block: string) =>
      block
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .sort();
    expect(declarations(pinnedDark![1])).toEqual(declarations(systemDark![1]));
    // No other dark block keys on the media query alone.
    expect(css.match(/@media \(prefers-color-scheme: dark\)/g)).toHaveLength(1);
  });
});
