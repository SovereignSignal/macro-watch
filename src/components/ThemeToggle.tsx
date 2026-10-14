'use client';

import { useEffect, useState } from 'react';

/**
 * The theme toggle, matching sovereignsignal.com: the page follows the
 * visitor's system setting until they press this, which pins `data-theme` on
 * <html> and remembers it in localStorage under "theme". The shared brand
 * tokens read that attribute, so one write switches every colour.
 *
 * The label names the mode the button switches to ("Dark mode" on a light
 * page). The server cannot know the current theme, so the button renders
 * without `data-ready` (CSS keeps it invisible but in flow) until the first
 * client effect reads the real state.
 */

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'theme';

/** The pre-paint script for the root layout head: applies a saved theme
 * before first paint and tints the browser chrome to match. Plain ES5, no
 * dependencies, so it runs before anything else loads. */
export const THEME_INIT_SCRIPT = [
  '(function(){',
  'try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}',
  'var p=getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();',
  'if(p){var m=document.querySelectorAll(\'meta[name="theme-color"]\');for(var i=0;i<m.length;i++)m[i].setAttribute("content",p)}',
  '})();',
].join('');

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function currentTheme(): Theme {
  const pinned = document.documentElement.dataset.theme;
  return pinned === 'light' || pinned === 'dark' ? pinned : systemTheme();
}

/** The browser chrome tint follows whichever paper is showing. */
function syncThemeColor() {
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  if (!paper) return;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', paper));
}

export function ThemeToggle({ className }: { className?: string }) {
  // The mode the button switches to; null until the client has looked.
  const [next, setNext] = useState<Theme | null>(null);

  useEffect(() => {
    const read = () => {
      setNext(currentTheme() === 'dark' ? 'light' : 'dark');
      syncThemeColor();
    };
    read();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);

  const toggle = () => {
    const to: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = to;
    try {
      localStorage.setItem(THEME_KEY, to);
    } catch {
      // Private mode or storage disabled: the choice still holds for this page.
    }
    setNext(to === 'dark' ? 'light' : 'dark');
    syncThemeColor();
  };

  const target = next ?? 'dark';
  return (
    <button
      type="button"
      className={className ? `theme-toggle ${className}` : 'theme-toggle'}
      onClick={toggle}
      aria-label={`Switch to ${target} mode`}
      data-ready={next ? '' : undefined}
    >
      {target === 'dark' ? 'Dark' : 'Light'}
      <span className="theme-toggle-word"> mode</span>
    </button>
  );
}
