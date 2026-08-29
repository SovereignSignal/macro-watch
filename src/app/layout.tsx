import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Mono } from 'next/font/google';
import Link from 'next/link';
import { Suspense } from 'react';
import { Mark } from '@/components/Mark';
import { MastheadUpdated } from '@/components/MastheadUpdated';
import './globals.css';
import './owned-brief.css';

// Self-hosted at build time by next/font. No runtime requests leave the site.
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
  title: { default: 'Sovs Macro', template: '%s · Sovs Macro' },
  description: 'Macro briefs, live themes, catalysts, and a public record of what held up.',
  openGraph: {
    type: 'website',
    siteName: 'Sovs Macro',
    title: 'Sovs Macro',
    description: 'Macro briefs, live themes, catalysts, and a public record of what held up.',
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
              <Link href="/" className="site-name" aria-label="Sovs Macro home">
                <Mark className="site-mark" size={26} />
                <span className="site-wordmark">Sovs Macro</span>
              </Link>
              <p className="byline">A Sovereign Signal project</p>
            </div>
            <Suspense fallback={null}>
              <MastheadUpdated />
            </Suspense>
          </div>
          <nav className="site-nav" aria-label="Site">
            <Link href="/">Brief</Link>
            <Link href="/briefs">Archive</Link>
            <Link href="/map">Theme map</Link>
            <Link href="/research">Research</Link>
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
            Sovs Macro is a Sovereign Signal project. AI composed. Brief HTML is sanitized before publication; verified panels disclose source coverage.
          </p>
          <p>
            Research only. No buy or sell recommendations.
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
