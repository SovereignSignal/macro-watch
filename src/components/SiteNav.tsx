'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const LINKS: { href: string; label: string; match: (path: string) => boolean }[] = [
  { href: '/', label: 'Brief', match: (path) => path === '/' },
  { href: '/briefs', label: 'Archive', match: (path) => path.startsWith('/briefs') },
  { href: '/map', label: 'Theme map', match: (path) => path.startsWith('/map') },
  { href: '/research', label: 'Research', match: (path) => path.startsWith('/research') },
  { href: '/track-record', label: 'Track record', match: (path) => path.startsWith('/track-record') },
  { href: '/accountability', label: 'Accountability', match: (path) => path.startsWith('/accountability') },
  { href: '/catalysts', label: 'Catalysts', match: (path) => path.startsWith('/catalysts') },
  { href: '/search', label: 'Search', match: (path) => path.startsWith('/search') },
  { href: '/about', label: 'About', match: (path) => path.startsWith('/about') },
];

export function SiteNav() {
  const pathname = usePathname() ?? '/';
  const navRef = useRef<HTMLElement>(null);
  // On phones the nav is one sideways-scrolling row. Bring the current page's
  // link into view without moving the page vertically.
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    const navBox = nav.getBoundingClientRect();
    const linkBox = current.getBoundingClientRect();
    if (linkBox.left >= navBox.left && linkBox.right <= navBox.right) return;
    nav.scrollLeft += linkBox.left - navBox.left - (navBox.width - linkBox.width) / 2;
  }, [pathname]);
  return (
    <nav ref={navRef} className="site-nav" aria-label="Site">
      {LINKS.map((link) => {
        const current = link.match(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? 'page' : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
