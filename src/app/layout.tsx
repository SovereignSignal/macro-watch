import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Mono } from 'next/font/google';
import Link from 'next/link';
import { Suspense } from 'react';
import { Mark } from '@/components/Mark';
import { MastheadUpdated } from '@/components/MastheadUpdated';
import './globals.css';

// Self-hosted at build time by next/font — no runtime requests leave the site.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-display',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://web-production-cb2e81.up.railway.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: 'macro.watch', template: '%s · macro.watch' },
  description:
    'AI-composed macro intelligence — deterministically validated, self-graded, published daily. SovsClaw, a Sovereign Signal system.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'macro.watch',
    title: 'macro.watch',
    description: 'AI-composed macro intelligence, deterministically validated and self-graded.',
    url: '/',
  },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plexMono.variable}`}>
      <body>
        <header className="site-header">
          <div className="masthead">
            <div>
              <Link href="/" className="site-name" aria-label="macro.watch — home">
                <Mark className="site-mark" size={26} />
                <span className="site-wordmark">
                  macro<span className="site-name-tld">.watch</span>
                </span>
              </Link>
              <p className="byline">SovsClaw — a Sovereign Signal system</p>
            </div>
            <Suspense fallback={null}>
              <MastheadUpdated />
            </Suspense>
          </div>
          <nav className="site-nav" aria-label="Site">
            <Link href="/">Brief</Link>
            <Link href="/briefs">Archive</Link>
            <Link href="/map">Theme map</Link>
            <Link href="/accountability">Accountability</Link>
            <Link href="/catalysts">Catalysts</Link>
            <Link href="/search">Search</Link>
            <Link href="/about">About</Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p className="footer-byline">
            <span className="footer-mark" aria-hidden="true">
              ◆
            </span>{' '}
            SovsClaw — a Sovereign Signal system. AI-composed, deterministically validated,
            self-graded.
          </p>
          <p>
            Not investment advice. Nothing here is a recommendation to buy or sell any security or
            asset.
          </p>
          <p className="footer-links">
            <a href="/feed.xml">RSS</a> · <Link href="/about">About</Link> ·{' '}
            <Link href="/accountability">Accountability</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
